from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Query, Cookie, Request, WebSocket, WebSocketDisconnect, Response
from fastapi.responses import Response as FastResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
import jwt
import bcrypt
import requests
import asyncio
import json
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- ENV ----------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
APP_NAME = os.environ.get('APP_NAME', 'homenexus')

# ---------- DB ----------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ---------- App ----------
app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- Storage ----------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
_storage_key: Optional[str] = None

def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not initialized")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 403:
        # refresh
        globals()['_storage_key'] = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 403:
        globals()['_storage_key'] = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    bio: Optional[str] = ""
    home_group: Optional[str] = None
    public_ip: Optional[str] = None
    created_at: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    picture: Optional[str] = None
    home_group: Optional[str] = None

class MessageIn(BaseModel):
    chat_id: str
    content: Optional[str] = ""
    file_id: Optional[str] = None
    transfer_mode: Optional[str] = "cloud"  # 'webrtc' or 'cloud'
    client_id: Optional[str] = None  # echoed back so the sender can reconcile its optimistic UI

class FriendActionIn(BaseModel):
    user_id: str

class FriendRespondIn(BaseModel):
    request_id: str
    accept: bool

class StoryCreateIn(BaseModel):
    file_id: str
    caption: Optional[str] = ""
    visibility: str = "friends"  # 'friends' or 'public'

# ---------- Auth helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_jwt(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("sub")
    except Exception:
        return None

async def get_current_user(
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
) -> dict:
    user_id = None
    # 1) Try session_token from cookie or auth header
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    # session_token via Emergent
    if session_token:
        s = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if s:
            expires = s.get("expires_at")
            if isinstance(expires, str):
                expires = datetime.fromisoformat(expires)
            if expires and expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires and expires >= datetime.now(timezone.utc):
                user_id = s["user_id"]
            else:
                logger.info("[auth] cookie session_token expired")
    # JWT in bearer token
    if not user_id and token:
        # Try as JWT
        uid = decode_jwt(token)
        if uid:
            user_id = uid
        else:
            # Try as session_token
            s = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
            if s:
                expires = s.get("expires_at")
                if isinstance(expires, str):
                    expires = datetime.fromisoformat(expires)
                if expires and expires.tzinfo is None:
                    expires = expires.replace(tzinfo=timezone.utc)
                if expires and expires >= datetime.now(timezone.utc):
                    user_id = s["user_id"]
                else:
                    logger.info("[auth] bearer session_token expired")
            else:
                logger.info("[auth] bearer token is not a valid JWT and not a known session_token")
    if not user_id:
        logger.info("[auth] get_current_user: no valid credentials found -> 401")
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        logger.warning(f"[auth] get_current_user: user_id={user_id} resolved from token but not found in DB -> 401")
        raise HTTPException(status_code=401, detail="User not found")
    return user

def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def chat_id_for_dm(uid1: str, uid2: str) -> str:
    a, b = sorted([uid1, uid2])
    return f"dm:{a}:{b}"

# ---------- Routes ----------

@api_router.get("/")
async def root():
    return {"ok": True, "app": "Home Nexus"}

# Auth - JWT
@api_router.post("/auth/register")
async def register(payload: RegisterIn, request: Request):
    logger.info(f"[auth] register attempt email={payload.email}")
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        logger.info(f"[auth] register rejected, email already exists: {payload.email}")
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    ip = get_client_ip(request)
    doc = {
        "user_id": user_id,
        "email": payload.email.lower(),
        "name": payload.name,
        "picture": None,
        "bio": "",
        "home_group": None,
        "public_ip": ip,
        "password_hash": hash_password(payload.password),
        "auth_provider": "jwt",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_jwt(user_id)
    user = {k: v for k, v in doc.items() if k != "password_hash"}
    logger.info(f"[auth] register success user_id={user_id}")
    return {"token": token, "user": user}

@api_router.post("/auth/login")
async def login(payload: LoginIn, request: Request):
    logger.info(f"[auth] login attempt email={payload.email}")
    u = await db.users.find_one({"email": payload.email.lower()})
    if not u or not u.get("password_hash") or not verify_password(payload.password, u["password_hash"]):
        logger.info(f"[auth] login failed (bad credentials) email={payload.email}")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    ip = get_client_ip(request)
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"public_ip": ip}})
    token = create_jwt(u["user_id"])
    user = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "password_hash": 0})
    logger.info(f"[auth] login success user_id={u['user_id']}")
    return {"token": token, "user": user}

# Auth - Emergent Google
@api_router.post("/auth/session")
async def emergent_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    try:
        resp = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}, timeout=20,
        )
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Session exchange failed: {e}")
    data = resp.json()
    email = data["email"].lower()
    ip = get_client_ip(request)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name", email.split("@")[0]),
            "picture": data.get("picture"),
            "bio": "",
            "home_group": None,
            "public_ip": ip,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"public_ip": ip, "picture": data.get("picture") or user.get("picture")}},
        )
    # Store session token
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": data["session_token"],
        "expires_at": expires.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token", value=data["session_token"],
        httponly=True, secure=True, samesite="none",
        path="/", max_age=7 * 24 * 60 * 60,
    )
    user.pop("password_hash", None)
    return {"user": user, "session_token": data["session_token"]}

@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return user

@api_router.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(None)):
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# Profile
@api_router.patch("/users/me")
async def update_me(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    u = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return u

@api_router.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.get("/users/{user_id}")
async def get_user(user_id: str, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u

# Network peers (same public IP or same home_group)
@api_router.get("/network/peers")
async def network_peers(user: dict = Depends(get_current_user)):
    me = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    q_or = []
    if me.get("public_ip"):
        q_or.append({"public_ip": me["public_ip"]})
    if me.get("home_group"):
        q_or.append({"home_group": me["home_group"]})
    if not q_or:
        return []
    peers = await db.users.find(
        {"$and": [{"$or": q_or}, {"user_id": {"$ne": user["user_id"]}}]},
        {"_id": 0, "password_hash": 0},
    ).to_list(500)
    return peers

# Friends
@api_router.post("/friends/request")
async def send_friend_request(payload: FriendActionIn, user: dict = Depends(get_current_user)):
    if payload.user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")
    target = await db.users.find_one({"user_id": payload.user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # already friends?
    existing = await db.friendships.find_one({
        "users": {"$all": [user["user_id"], payload.user_id]},
    })
    if existing:
        return {"status": "already_friends"}
    # already a pending request?
    pending = await db.friend_requests.find_one({
        "from_user": user["user_id"], "to_user": payload.user_id, "status": "pending",
    })
    if pending:
        return {"status": "already_pending"}
    req_id = str(uuid.uuid4())
    await db.friend_requests.insert_one({
        "request_id": req_id,
        "from_user": user["user_id"],
        "to_user": payload.user_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": "sent", "request_id": req_id}

@api_router.get("/friends/requests")
async def list_friend_requests(user: dict = Depends(get_current_user)):
    reqs = await db.friend_requests.find(
        {"to_user": user["user_id"], "status": "pending"}, {"_id": 0},
    ).to_list(500)
    # enrich with sender info
    for r in reqs:
        sender = await db.users.find_one({"user_id": r["from_user"]}, {"_id": 0, "password_hash": 0})
        r["from_user_info"] = sender
    return reqs

@api_router.post("/friends/respond")
async def respond_friend_request(payload: FriendRespondIn, user: dict = Depends(get_current_user)):
    req = await db.friend_requests.find_one({"request_id": payload.request_id, "to_user": user["user_id"]})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if payload.accept:
        await db.friendships.insert_one({
            "friendship_id": str(uuid.uuid4()),
            "users": sorted([req["from_user"], req["to_user"]]),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.friend_requests.update_one({"request_id": payload.request_id}, {"$set": {"status": "accepted"}})
        return {"status": "accepted"}
    else:
        await db.friend_requests.update_one({"request_id": payload.request_id}, {"$set": {"status": "declined"}})
        return {"status": "declined"}

@api_router.get("/friends")
async def list_friends(user: dict = Depends(get_current_user)):
    fr = await db.friendships.find({"users": user["user_id"]}, {"_id": 0}).to_list(1000)
    friend_ids = []
    for f in fr:
        for uid in f["users"]:
            if uid != user["user_id"]:
                friend_ids.append(uid)
    if not friend_ids:
        return []
    friends = await db.users.find(
        {"user_id": {"$in": friend_ids}}, {"_id": 0, "password_hash": 0},
    ).to_list(1000)
    return friends

# Chats
@api_router.get("/chats")
async def list_chats(user: dict = Depends(get_current_user)):
    # Self chat
    chats = [{
        "chat_id": f"self:{user['user_id']}",
        "type": "self",
        "title": "Self Chat (You)",
    }]
    # Public channel
    chats.append({"chat_id": "public:home", "type": "public", "title": "Public Home Channel"})
    # DM chats - find latest message for any DM involving user
    pipeline = [
        {"$match": {"chat_id": {"$regex": f"^dm:"}, "participants": user["user_id"]}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$chat_id", "last_message": {"$first": "$$ROOT"}}},
    ]
    dm_messages = await db.messages.aggregate(pipeline).to_list(500)
    for d in dm_messages:
        chat_id = d["_id"]
        # find other user
        parts = chat_id.split(":")[1:]
        other = parts[0] if parts[1] == user["user_id"] else parts[1]
        other_user = await db.users.find_one({"user_id": other}, {"_id": 0, "password_hash": 0})
        chats.append({
            "chat_id": chat_id, "type": "dm",
            "title": other_user["name"] if other_user else "Unknown",
            "other_user": other_user,
            "last_message": {
                "content": d["last_message"].get("content"),
                "created_at": d["last_message"].get("created_at"),
            },
        })
    return chats

@api_router.post("/chats/dm/{other_user_id}")
async def get_or_create_dm(other_user_id: str, user: dict = Depends(get_current_user)):
    other = await db.users.find_one({"user_id": other_user_id}, {"_id": 0, "password_hash": 0})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    cid = chat_id_for_dm(user["user_id"], other_user_id)
    return {"chat_id": cid, "type": "dm", "other_user": other, "title": other["name"]}

@api_router.get("/chats/{chat_id}/messages")
async def get_messages(chat_id: str, user: dict = Depends(get_current_user), limit: int = 100):
    # auth check
    if chat_id.startswith("dm:"):
        parts = chat_id.split(":")[1:]
        if user["user_id"] not in parts:
            raise HTTPException(status_code=403, detail="Not a participant")
    elif chat_id.startswith("self:"):
        if chat_id.split(":")[1] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your self-chat")
    msgs = await db.messages.find({"chat_id": chat_id}, {"_id": 0}).sort("created_at", 1).to_list(limit)
    # enrich file info
    for m in msgs:
        if m.get("file_id"):
            f = await db.files.find_one({"file_id": m["file_id"]}, {"_id": 0})
            if f:
                m["file"] = {
                    "file_id": f["file_id"],
                    "filename": f["filename"],
                    "size": f["size"],
                    "content_type": f["content_type"],
                }
    return msgs

@api_router.post("/chats/{chat_id}/messages")
async def post_message(chat_id: str, payload: MessageIn, user: dict = Depends(get_current_user)):
    participants = []
    if chat_id.startswith("dm:"):
        parts = chat_id.split(":")[1:]
        if user["user_id"] not in parts:
            raise HTTPException(status_code=403, detail="Not a participant")
        participants = parts
    elif chat_id.startswith("self:"):
        if chat_id.split(":")[1] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your self-chat")
        participants = [user["user_id"]]
    elif chat_id == "public:home":
        participants = ["__public__"]
    msg = {
        "message_id": str(uuid.uuid4()),
        "chat_id": chat_id,
        "sender_id": user["user_id"],
        "sender_name": user["name"],
        "sender_picture": user.get("picture"),
        "content": payload.content or "",
        "file_id": payload.file_id,
        "transfer_mode": payload.transfer_mode or "cloud",
        "client_id": payload.client_id,
        "participants": participants,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    if msg.get("file_id"):
        f = await db.files.find_one({"file_id": msg["file_id"]}, {"_id": 0})
        if f:
            msg["file"] = {"file_id": f["file_id"], "filename": f["filename"], "size": f["size"], "content_type": f["content_type"]}
    logger.info(f"[message] chat={chat_id} sender={user['user_id']} has_file={bool(msg.get('file_id'))} mode={msg['transfer_mode']}")
    # broadcast via websocket
    await manager.broadcast_message(msg)
    return msg

# Files
@api_router.post("/upload")
async def upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{user['user_id']}/{file_id}.{ext}"
    data = await file.read()
    logger.info(f"[upload] user={user['user_id']} filename={file.filename} size={len(data)} bytes")
    result = put_object(path, data, file.content_type or "application/octet-stream")
    doc = {
        "file_id": file_id,
        "storage_path": result["path"],
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": result.get("size", len(data)),
        "owner_id": user["user_id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(doc)
    doc.pop("_id", None)
    logger.info(f"[upload] stored file_id={file_id} path={path}")
    return doc

@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, auth: Optional[str] = Query(None), authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    # custom auth supporting query auth param for <img src>
    user = await get_current_user(
        authorization=authorization or (f"Bearer {auth}" if auth else None),
        session_token=session_token,
    )
    record = await db.files.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = get_object(record["storage_path"])
    return FastResponse(content=data, media_type=record.get("content_type", content_type))

# Stories
@api_router.post("/stories")
async def create_story(payload: StoryCreateIn, user: dict = Depends(get_current_user)):
    f = await db.files.find_one({"file_id": payload.file_id, "owner_id": user["user_id"]})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    now = datetime.now(timezone.utc)
    story = {
        "story_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "user_name": user["name"],
        "user_picture": user.get("picture"),
        "file_id": payload.file_id,
        "content_type": f["content_type"],
        "caption": payload.caption or "",
        "visibility": payload.visibility,
        "viewers": [],
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
    }
    await db.stories.insert_one(story)
    story.pop("_id", None)
    return story

@api_router.get("/stories")
async def list_stories(visibility: str = "all", user: dict = Depends(get_current_user)):
    now_iso = datetime.now(timezone.utc).isoformat()
    # public + friends-only stories from friends + own
    fr = await db.friendships.find({"users": user["user_id"]}, {"_id": 0}).to_list(1000)
    friend_ids = set()
    for f in fr:
        for uid in f["users"]:
            if uid != user["user_id"]:
                friend_ids.add(uid)
    visible_user_ids = list(friend_ids) + [user["user_id"]]
    q = {"$or": [
        {"visibility": "public"},
        {"visibility": "friends", "user_id": {"$in": visible_user_ids}},
        {"user_id": user["user_id"]},
    ], "expires_at": {"$gt": now_iso}}
    if visibility == "friends":
        q = {"visibility": "friends", "user_id": {"$in": visible_user_ids}, "expires_at": {"$gt": now_iso}}
    elif visibility == "public":
        q = {"visibility": "public", "expires_at": {"$gt": now_iso}}
    stories = await db.stories.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return stories

@api_router.post("/stories/{story_id}/view")
async def view_story(story_id: str, user: dict = Depends(get_current_user)):
    await db.stories.update_one(
        {"story_id": story_id},
        {"$addToSet": {"viewers": {"user_id": user["user_id"], "name": user["name"], "at": datetime.now(timezone.utc).isoformat()}}},
    )
    return {"ok": True}

# ---------- WebSocket ----------
class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, List[WebSocket]] = {}  # user_id -> [ws]

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(user_id, []).append(ws)
        logger.info(f"[ws] connected user={user_id} total_sockets_for_user={len(self.active[user_id])}")

    def disconnect(self, user_id: str, ws: WebSocket):
        if user_id in self.active:
            try:
                self.active[user_id].remove(ws)
            except ValueError:
                pass
            if not self.active[user_id]:
                del self.active[user_id]
        logger.info(f"[ws] disconnected user={user_id}")

    async def send_to_user(self, user_id: str, data: dict):
        for ws in self.active.get(user_id, []):
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.warning(f"[ws] send_to_user failed user={user_id} err={e}")

    async def broadcast_all(self, data: dict):
        for uid, sockets in list(self.active.items()):
            for ws in sockets:
                try:
                    await ws.send_json(data)
                except Exception as e:
                    logger.warning(f"[ws] broadcast_all failed user={uid} err={e}")

    async def broadcast_message(self, msg: dict):
        chat_id = msg["chat_id"]
        event = {"type": "message", "message": msg}
        if chat_id.startswith("dm:"):
            parts = chat_id.split(":")[1:]
            for uid in parts:
                await self.send_to_user(uid, event)
        elif chat_id.startswith("self:"):
            await self.send_to_user(msg["sender_id"], event)
        elif chat_id == "public:home":
            await self.broadcast_all(event)

manager = ConnectionManager()

@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    # Authenticate via token in query
    user_id = decode_jwt(token)
    if not user_id:
        s = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if s:
            user_id = s["user_id"]
    if not user_id:
        logger.info("[ws] rejected connection: invalid token")
        await ws.close(code=4401)
        return
    await manager.connect(user_id, ws)
    try:
        while True:
            data = await ws.receive_json()
            etype = data.get("type")
            if etype == "ping":
                await ws.send_json({"type": "pong"})
            elif etype == "signal":
                # WebRTC signaling: relay to target user
                target = data.get("target_user_id")
                if target:
                    await manager.send_to_user(target, {
                        "type": "signal",
                        "from_user_id": user_id,
                        "signal_type": data.get("signal_type"),  # offer/answer/ice
                        "payload": data.get("payload"),
                        "transfer_id": data.get("transfer_id"),
                    })
            elif etype == "typing":
                chat_id = data.get("chat_id")
                if chat_id and chat_id.startswith("dm:"):
                    parts = chat_id.split(":")[1:]
                    for uid in parts:
                        if uid != user_id:
                            await manager.send_to_user(uid, {"type": "typing", "chat_id": chat_id, "from_user_id": user_id})
    except WebSocketDisconnect:
        manager.disconnect(user_id, ws)
    except Exception as e:
        logger.error(f"WS error: {e}")
        manager.disconnect(user_id, ws)

# ---------- Wire app ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    init_storage()
    # Indexes
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.messages.create_index([("chat_id", 1), ("created_at", 1)])
    await db.stories.create_index("expires_at")
    await db.files.create_index("file_id", unique=True)
    logger.info("Startup complete")

@app.on_event("shutdown")
async def shutdown():
    client.close()
