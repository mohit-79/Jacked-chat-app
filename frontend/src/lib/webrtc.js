// WebRTC data channel manager for ultra-fast P2P file transfer.
// Falls back to cloud upload if peer unreachable.
//
// Fixes vs. the original implementation:
// - ICE candidates that arrive before the remote description is set are now
//   queued and flushed afterwards (previously they were silently dropped,
//   which is the #1 reason P2P connections would stall or never connect).
// - Chunk size raised from 64KB -> 256KB and the buffered-amount back-pressure
//   loop now waits on the datachannel's own 'bufferedamountlow' event instead
//   of polling every 30ms, which removes most of the "choppy" stalling.
// - Progress now reports bytes/sec so the UI can show live transfer speed.

const log = (...args) => console.log("[WebRTC]", ...args);

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const CHUNK_SIZE = 256 * 1024; // 256KB — large enough to be fast, small enough to stay responsive
const BUFFER_HIGH_WATERMARK = 8 * 1024 * 1024; // pause sending above this
const BUFFER_LOW_WATERMARK = 1 * 1024 * 1024; // resume sending below this

export class WebRTCTransfer {
  constructor({ wsSend, selfId }) {
    this.wsSend = wsSend;
    this.selfId = selfId;
    this.peers = new Map(); // transferId -> ctx
  }

  async initiateSend({ targetUserId, file, onProgress, onComplete, onError }) {
    const transferId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const dc = pc.createDataChannel("file", { ordered: true });
    dc.binaryType = "arraybuffer";
    dc.bufferedAmountLowThreshold = BUFFER_LOW_WATERMARK;

    const ctx = {
      pc, dc, file,
      onProgress, onComplete, onError,
      isInitiator: true,
      bytesSent: 0,
      pendingCandidates: [],
      remoteDescriptionSet: false,
    };
    this.peers.set(transferId, ctx);
    log("initiateSend: starting transfer", transferId, "to", targetUserId, file.name, file.size, "bytes");

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.wsSend({ type: "signal", target_user_id: targetUserId, signal_type: "ice", payload: e.candidate, transfer_id: transferId });
      }
    };
    pc.onconnectionstatechange = () => log("connection state:", pc.connectionState, transferId);

    dc.onopen = () => {
      log("data channel open, sending meta + chunks", transferId);
      dc.send(JSON.stringify({ kind: "meta", name: file.name, size: file.size, type: file.type }));

      const startedAt = Date.now();
      let offset = 0;
      const reader = new FileReader();

      const sendNextChunk = () => {
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
        const buf = reader.result;
        const writeChunk = () => {
          dc.send(buf);
          offset += buf.byteLength;
          ctx.bytesSent = offset;
          const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.01);
          onProgress?.({
            transferId,
            percent: Math.min(100, (offset / file.size) * 100),
            bytesPerSec: offset / elapsedSec,
            loaded: offset,
            total: file.size,
          });
          sendNextChunk();
        };
        // Back-pressure: if the channel's send buffer is too full, wait for
        // 'bufferedamountlow' instead of busy-polling — this is what was
        // making transfers choppy before.
        if (dc.bufferedAmount > BUFFER_HIGH_WATERMARK) {
          dc.addEventListener("bufferedamountlow", writeChunk, { once: true });
        } else {
          writeChunk();
        }
      };

      sendNextChunk();
    };

    dc.onerror = (e) => { log("data channel error", transferId, e); onError?.(e); };
    dc.onclose = () => log("data channel closed", transferId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.wsSend({ type: "signal", target_user_id: targetUserId, signal_type: "offer", payload: offer, transfer_id: transferId });

    const timer = setTimeout(() => {
      if (pc.connectionState !== "connected") {
        log("timeout waiting for connection", transferId, "state:", pc.connectionState);
        onError?.(new Error("webrtc-timeout"));
        try { pc.close(); } catch {}
        this.peers.delete(transferId);
      }
    }, 10000);
    ctx.timer = timer;

    return transferId;
  }

  async handleSignal({ from_user_id, signal_type, payload, transfer_id }, onIncomingFile) {
    let ctx = this.peers.get(transfer_id);

    if (signal_type === "offer") {
      log("handling incoming offer", transfer_id, "from", from_user_id);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      ctx = {
        pc, isInitiator: false, chunks: [], receivedBytes: 0, fileMeta: null,
        onIncomingFile, pendingCandidates: [], remoteDescriptionSet: false,
      };
      this.peers.set(transfer_id, ctx);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.wsSend({ type: "signal", target_user_id: from_user_id, signal_type: "ice", payload: e.candidate, transfer_id });
        }
      };
      pc.onconnectionstatechange = () => log("connection state:", pc.connectionState, transfer_id);

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
              log("receiving file", obj.name, obj.size, "bytes", transfer_id);
            } else if (obj.kind === "end") {
              const blob = new Blob(ctx.chunks, { type: ctx.fileMeta?.type || "application/octet-stream" });
              log("file received complete", transfer_id);
              onIncomingFile?.({ blob, meta: ctx.fileMeta, fromUserId: from_user_id, transferId: transfer_id });
              try { pc.close(); } catch {}
              this.peers.delete(transfer_id);
            }
          } else {
            ctx.chunks.push(msg.data);
            ctx.receivedBytes += msg.data.byteLength;
            const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.01);
            ctx.onProgress?.({
              transferId: transfer_id,
              percent: ctx.fileMeta?.size ? Math.min(100, (ctx.receivedBytes / ctx.fileMeta.size) * 100) : 0,
              bytesPerSec: ctx.receivedBytes / elapsedSec,
              loaded: ctx.receivedBytes,
              total: ctx.fileMeta?.size,
            });
          }
        };
      };

      await pc.setRemoteDescription(payload);
      ctx.remoteDescriptionSet = true;
      // Flush any ICE candidates that arrived before the offer was processed.
      for (const cand of ctx.pendingCandidates) {
        try { await pc.addIceCandidate(cand); } catch (e) { log("error flushing queued ICE candidate", e); }
      }
      ctx.pendingCandidates = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.wsSend({ type: "signal", target_user_id: from_user_id, signal_type: "answer", payload: answer, transfer_id });
    } else if (signal_type === "answer" && ctx) {
      await ctx.pc.setRemoteDescription(payload);
      ctx.remoteDescriptionSet = true;
      for (const cand of ctx.pendingCandidates) {
        try { await ctx.pc.addIceCandidate(cand); } catch (e) { log("error flushing queued ICE candidate", e); }
      }
      ctx.pendingCandidates = [];
    } else if (signal_type === "ice") {
      if (ctx && ctx.remoteDescriptionSet) {
        try { await ctx.pc.addIceCandidate(payload); } catch (e) { log("addIceCandidate failed", e); }
      } else if (ctx) {
        // Remote description not set yet — queue for later instead of dropping.
        ctx.pendingCandidates.push(payload);
      } else {
        log("ice candidate for unknown transfer (likely arrived before offer)", transfer_id);
      }
    }
  }
}
