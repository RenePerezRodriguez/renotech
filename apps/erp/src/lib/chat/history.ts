import { db } from '@/lib/firebase';
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, limit, serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import type { ChatMessage, ChatConversation, ChatFavorite, ChatAlias } from '@/types/chat';

// ─── Firestore path helpers ───────────────────────────────────────────────────

const convsRef = (uid: string) =>
  collection(db, 'user_chat', uid, 'conversations');

const convDoc = (uid: string, convId: string) =>
  doc(db, 'user_chat', uid, 'conversations', convId);

const msgsRef = (uid: string, convId: string) =>
  collection(db, 'user_chat', uid, 'conversations', convId, 'messages');

const msgDoc = (uid: string, convId: string, msgId: string) =>
  doc(db, 'user_chat', uid, 'conversations', convId, 'messages', msgId);

const favsRef = (uid: string) =>
  collection(db, 'user_chat', uid, 'favorites');

const aliasesRef = (uid: string) =>
  collection(db, 'user_chat', uid, 'aliases');

// ─── Conversations ────────────────────────────────────────────────────────────

export async function createConversation(
  uid: string,
  title: string,
  branchId?: string | null,
): Promise<string> {
  const ref = await addDoc(convsRef(uid), {
    title,
    preview: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    messageCount: 0,
    branchId: branchId ?? null,
  });
  return ref.id;
}

export async function updateConversationMeta(
  uid: string,
  convId: string,
  preview: string,
  messageCount: number,
): Promise<void> {
  await updateDoc(convDoc(uid, convId), {
    preview,
    messageCount,
    updatedAt: serverTimestamp(),
  });
}

export async function loadConversations(uid: string): Promise<ChatConversation[]> {
  const q = query(convsRef(uid), orderBy('updatedAt', 'desc'), limit(20));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as DocumentData;
    return {
      id: d.id,
      title: data.title ?? 'Conversación',
      preview: data.preview ?? '',
      createdAt: data.createdAt?.toMillis() ?? Date.now(),
      updatedAt: data.updatedAt?.toMillis() ?? Date.now(),
      messageCount: data.messageCount ?? 0,
      branchId: data.branchId ?? null,
    };
  });
}

export async function deleteConversation(uid: string, convId: string): Promise<void> {
  await deleteDoc(convDoc(uid, convId));
}

export async function renameConversation(uid: string, convId: string, title: string): Promise<void> {
  await updateDoc(convDoc(uid, convId), { title, updatedAt: serverTimestamp() });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function saveMessage(uid: string, convId: string, msg: ChatMessage): Promise<void> {
  await setDoc(msgDoc(uid, convId, msg.id), {
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    pinned: msg.pinned ?? false,
    feedback: msg.feedback ?? null,
    data: msg.data ?? null,
  });
}

export async function updateMessageField(
  uid: string,
  convId: string,
  msgId: string,
  fields: Partial<Pick<ChatMessage, 'pinned' | 'feedback' | 'content'>>,
): Promise<void> {
  await updateDoc(msgDoc(uid, convId, msgId), fields as DocumentData);
}

export async function loadMessages(uid: string, convId: string): Promise<ChatMessage[]> {
  const q = query(msgsRef(uid, convId), orderBy('timestamp', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as DocumentData;
    return {
      id: d.id,
      role: data.role as 'user' | 'assistant',
      content: data.content ?? '',
      timestamp: data.timestamp ?? Date.now(),
      pinned: data.pinned ?? false,
      feedback: data.feedback ?? undefined,
      data: data.data ?? undefined,
    };
  });
}

// ─── Favorites ────────────────────────────────────────────────────────────────

export async function saveFavorite(
  uid: string,
  label: string,
  message: string,
): Promise<ChatFavorite> {
  const ref = await addDoc(favsRef(uid), {
    label,
    message,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, label, message, createdAt: Date.now() };
}

export async function loadFavorites(uid: string): Promise<ChatFavorite[]> {
  const q = query(favsRef(uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as DocumentData;
    return {
      id: d.id,
      label: data.label ?? '',
      message: data.message ?? '',
      createdAt: data.createdAt?.toMillis() ?? Date.now(),
    };
  });
}

export async function deleteFavorite(uid: string, favoriteId: string): Promise<void> {
  await deleteDoc(doc(db, 'user_chat', uid, 'favorites', favoriteId));
}

// ─── Aliases ──────────────────────────────────────────────────────────────────

export async function saveAlias(
  uid: string,
  trigger: string,
  message: string,
): Promise<ChatAlias> {
  const normalized = trigger.toLowerCase().trim();
  const ref = await addDoc(aliasesRef(uid), {
    trigger: normalized,
    message,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, trigger: normalized, message, createdAt: Date.now() };
}

export async function loadAliases(uid: string): Promise<ChatAlias[]> {
  const snap = await getDocs(aliasesRef(uid));
  return snap.docs.map((d) => {
    const data = d.data() as DocumentData;
    return {
      id: d.id,
      trigger: data.trigger ?? '',
      message: data.message ?? '',
      createdAt: data.createdAt?.toMillis() ?? Date.now(),
    };
  });
}

export async function deleteAlias(uid: string, aliasId: string): Promise<void> {
  await deleteDoc(doc(db, 'user_chat', uid, 'aliases', aliasId));
}

/** Resolve input against user aliases. Returns expanded message or original. */
export function resolveAlias(aliases: ChatAlias[], input: string): string {
  const normalized = input.toLowerCase().trim();
  const match = aliases.find((a) => a.trigger === normalized);
  return match ? match.message : input;
}
