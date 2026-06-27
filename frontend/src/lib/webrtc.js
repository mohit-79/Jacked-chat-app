// WebRTC data channel manager for ultra-fast P2P file transfer.
const log = (...args) => console.log("[WebRTC]", ...args);

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const CHUNK_SIZE = 256 * 1024;
const BUFFER_HIGH_WATERMARK = 8 * 1024 * 1024;
const BUFFER_LOW_WATERMARK = 1 * 1024 * 1024;

export class WebRTCTransfer {
  constructor({ wsSend, selfId }) {
    this.wsSend = wsSend;
    this.selfId = selfId;
    this.peers = new Map(); // transferId -> ctx
  }

  async initiateSend({ targetUserId, file, onProgress, onComplete, onError, onCancel, transferId: existingId }) {
    const transferId = existingId || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const dc = pc.createDataChannel("file", { ordered: true });
    dc.binaryType = "arraybuffer";
    dc.bufferedAmountLowThreshold = BUFFER_LOW_WATERMARK;

    let cancelled = false;
    const ctx = {
      pc, dc, file,
      onProgress, onComplete, onError, onCancel,
      isInitiator: true,
      bytesSent: 0,
      pendingCandidates: [],
      remoteDescriptionSet: false,
      cancelled: false,
      // Expose cancel function on context
      cancel: () => {
        cancelled = true;
        ctx.cancelled = true;
        log("transfer cancelled", transferId);
        try { dc.close(); } catch {}
        try { pc.close(); } catch {}
        this.peers.delete(transferId);
        onCancel?.({ transferId });
      },
    };
    this.peers.set(transferId, ctx);
    log("initiateSend:", transferId, "->", targetUserId, file.name, file.size, "bytes");

    pc.onicecandidate = (e) => {
      if (e.candidate && !cancelled) {
        this.wsSend({ type: "signal", target_user_id: targetUserId, signal_type: "ice", payload: e.candidate, transfer_id: transferId });
      }
    };
    pc.onconnectionstatechange = () => log("conn state:", pc.connectionState, transferId);

    dc.onopen = () => {
      if (cancelled) return;
      log("data channel open", transferId);
      dc.send(JSON.stringify({ kind: "meta", name: file.name, size: file.size, type: file.type }));

      const startedAt = Date.now();
      let offset = 0;
      const reader = new FileReader();

      const sendNextChunk = () => {
        if (cancelled) return;
        if (offset >= file.size) {
          dc.send(JSON.stringify({ kind: "end" }));
          log("transfer complete", transferId);
          onComplete?.({ transferId, mode: "webrtc" });
          setTimeout(() => { try { pc.close(); } catch {} this.peers.delete(transferId); }, 1000);
          return;
        }
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = () => {
        if (cancelled) return;
        const buf = reader.result;
        const writeChunk = () => {
          if (cancelled) return;
          dc.send(buf);
          offset += buf.byteLength;
          ctx.bytesSent = offset;
          const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.01);
          onProgress?.({ transferId, percent: Math.min(100, (offset / file.size) * 100), bytesPerSec: offset / elapsedSec, loaded: offset, total: file.size });
          sendNextChunk();
        };
        if (dc.bufferedAmount > BUFFER_HIGH_WATERMARK) {
          dc.addEventListener("bufferedamountlow", writeChunk, { once: true });
        } else {
          writeChunk();
        }
      };

      sendNextChunk();
    };

    dc.onerror = (e) => { if (!cancelled) { log("dc error", transferId, e); onError?.(e); } };
    dc.onclose = () => log("dc closed", transferId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.wsSend({ type: "signal", target_user_id: targetUserId, signal_type: "offer", payload: offer, transfer_id: transferId });

    const timer = setTimeout(() => {
      if (pc.connectionState !== "connected" && !cancelled) {
        log("timeout", transferId, "state:", pc.connectionState);
        onError?.(new Error("webrtc-timeout"));
        try { pc.close(); } catch {}
        this.peers.delete(transferId);
      }
    }, 10000);
    ctx.timer = timer;

    return transferId;
  }

  // Cancel an in-progress outgoing transfer
  cancelTransfer(transferId) {
    const ctx = this.peers.get(transferId);
    if (ctx?.cancel) {
      ctx.cancel();
      return true;
    }
    return false;
  }

  async handleSignal({ from_user_id, signal_type, payload, transfer_id }, onIncomingFile) {
    let ctx = this.peers.get(transfer_id);

    if (signal_type === "offer") {
      log("incoming offer", transfer_id, "from", from_user_id);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      ctx = {
        pc, isInitiator: false, chunks: [], receivedBytes: 0, fileMeta: null,
        onIncomingFile, pendingCandidates: [], remoteDescriptionSet: false,
      };
      this.peers.set(transfer_id, ctx);

      pc.onicecandidate = (e) => {
        if (e.candidate) this.wsSend({ type: "signal", target_user_id: from_user_id, signal_type: "ice", payload: e.candidate, transfer_id });
      };
      pc.onconnectionstatechange = () => log("conn state:", pc.connectionState, transfer_id);

      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dc.binaryType = "arraybuffer";
        ctx.dc = dc;
        const startedAt = Date.now();
        dc.onmessage = (msg) => {
          if (typeof msg.data === "string") {
            const obj = JSON.parse(msg.data);
            if (obj.kind === "meta") {
              ctx.fileMeta = obj;
              log("receiving", obj.name, obj.size, "bytes", transfer_id);
            } else if (obj.kind === "end") {
              const blob = new Blob(ctx.chunks, { type: ctx.fileMeta?.type || "application/octet-stream" });
              log("received complete", transfer_id);
              onIncomingFile?.({ blob, meta: ctx.fileMeta, fromUserId: from_user_id, transferId: transfer_id });
              try { pc.close(); } catch {}
              this.peers.delete(transfer_id);
            }
          } else {
            ctx.chunks.push(msg.data);
            ctx.receivedBytes += msg.data.byteLength;
            const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.01);
            ctx.onProgress?.({ transferId: transfer_id, percent: ctx.fileMeta?.size ? Math.min(100, (ctx.receivedBytes / ctx.fileMeta.size) * 100) : 0, bytesPerSec: ctx.receivedBytes / elapsedSec, loaded: ctx.receivedBytes, total: ctx.fileMeta?.size });
          }
        };
      };

      await pc.setRemoteDescription(payload);
      ctx.remoteDescriptionSet = true;
      for (const cand of ctx.pendingCandidates) {
        try { await pc.addIceCandidate(cand); } catch (e) { log("flush ICE err", e); }
      }
      ctx.pendingCandidates = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.wsSend({ type: "signal", target_user_id: from_user_id, signal_type: "answer", payload: answer, transfer_id });
    } else if (signal_type === "answer" && ctx) {
      await ctx.pc.setRemoteDescription(payload);
      ctx.remoteDescriptionSet = true;
      for (const cand of ctx.pendingCandidates) {
        try { await ctx.pc.addIceCandidate(cand); } catch (e) { log("flush ICE err", e); }
      }
      ctx.pendingCandidates = [];
    } else if (signal_type === "ice") {
      if (ctx?.remoteDescriptionSet) {
        try { await ctx.pc.addIceCandidate(payload); } catch (e) { log("addIceCandidate failed", e); }
      } else if (ctx) {
        ctx.pendingCandidates.push(payload);
      } else {
        log("ice for unknown transfer", transfer_id);
      }
    }
  }
}
