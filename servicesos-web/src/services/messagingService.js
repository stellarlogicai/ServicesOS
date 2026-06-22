// src/services/messagingService.js
/**
 * Customer Messaging Service
 * In-app chat between customer, cleaner, and office
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Message status constants
export const MESSAGE_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read'
};

// Message type constants
export const MESSAGE_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  DOCUMENT: 'document',
  SYSTEM: 'system'
};

// Participant type constants
export const PARTICIPANT_TYPE = {
  CUSTOMER: 'customer',
  EMPLOYEE: 'employee',
  OFFICE: 'office'
};

/**
 * Create a conversation
 * @param {string} tenantId - Tenant ID
 * @param {object} conversationData - Conversation data
 * @returns {Promise<DocumentReference>}
 */
export async function createConversation(tenantId, conversationData) {
  const conversationsRef = collection(db, 'tenants', tenantId, 'conversations');
  
  const data = {
    customerId: conversationData.customerId,
    customerName: conversationData.customerName || '',
    jobId: conversationData.jobId || null,
    jobDate: conversationData.jobDate || null,
    
    // Participants
    participants: conversationData.participants || [
      { id: conversationData.customerId, type: PARTICIPANT_TYPE.CUSTOMER, name: conversationData.customerName }
    ],
    
    // Status
    status: 'active',
    
    // Last message preview
    lastMessage: '',
    lastMessageAt: null,
    lastMessageBy: null,
    
    // Unread counts
    unreadCount: {},
    
    // Timestamps
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  return await addDoc(conversationsRef, data);
}

/**
 * Send a message
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @param {object} messageData - Message data
 * @returns {Promise<DocumentReference>}
 */
export async function sendMessage(tenantId, conversationId, messageData) {
  const messagesRef = collection(db, 'tenants', tenantId, 'conversations', conversationId, 'messages');
  
  const data = {
    senderId: messageData.senderId,
    senderName: messageData.senderName || '',
    senderType: messageData.senderType || PARTICIPANT_TYPE.CUSTOMER,
    
    // Message content
    type: messageData.type || MESSAGE_TYPE.TEXT,
    content: messageData.content || '',
    attachments: messageData.attachments || [],
    
    // Status
    status: MESSAGE_STATUS.SENT,
    
    // Timestamps
    createdAt: serverTimestamp()
  };
  
  // Add message
  const messageRef = await addDoc(messagesRef, data);
  
  // Update conversation with last message info
  const conversationRef = doc(db, 'tenants', tenantId, 'conversations', conversationId);
  await updateDoc(conversationRef, {
    lastMessage: messageData.content || (messageData.type === MESSAGE_TYPE.IMAGE ? '[Image]' : '[Attachment]'),
    lastMessageAt: serverTimestamp(),
    lastMessageBy: messageData.senderId,
    updatedAt: serverTimestamp()
  });
  
  // Increment unread count for all participants except sender
  const conversationSnap = await getDoc(conversationRef);
  if (conversationSnap.exists()) {
    const conversation = conversationSnap.data();
    const unreadCount = conversation.unreadCount || {};
    
    for (const participant of conversation.participants || []) {
      if (participant.id !== messageData.senderId) {
        unreadCount[participant.id] = (unreadCount[participant.id] || 0) + 1;
      }
    }
    
    await updateDoc(conversationRef, { unreadCount });
  }
  
  return messageRef;
}

/**
 * Mark messages as read
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID marking as read
 * @returns {Promise<void>}
 */
export async function markMessagesAsRead(tenantId, conversationId, userId) {
  const messagesRef = collection(db, 'tenants', tenantId, 'conversations', conversationId, 'messages');
  const q = query(
    messagesRef,
    where('senderId', '!=', userId),
    where('status', '!=', MESSAGE_STATUS.READ)
  );
  const snapshot = await getDocs(q);
  
  const batch = [];
  for (const doc of snapshot.docs) {
    batch.push(updateDoc(doc.ref, { status: MESSAGE_STATUS.READ }));
  }
  
  await Promise.all(batch);
  
  // Reset unread count for user
  const conversationRef = doc(db, 'tenants', tenantId, 'conversations', conversationId);
  const conversationSnap = await getDoc(conversationRef);
  
  if (conversationSnap.exists()) {
    const conversation = conversationSnap.data();
    const unreadCount = conversation.unreadCount || {};
    unreadCount[userId] = 0;
    
    await updateDoc(conversationRef, { unreadCount });
  }
}

/**
 * Get conversation by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object|null>}
 */
export async function getConversation(tenantId, conversationId) {
  const conversationRef = doc(db, 'tenants', tenantId, 'conversations', conversationId);
  const conversationSnap = await getDoc(conversationRef);
  
  if (!conversationSnap.exists()) {
    return null;
  }
  
  return { id: conversationSnap.id, ...conversationSnap.data() };
}

/**
 * Get conversation for customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object|null>}
 */
export async function getCustomerConversation(tenantId, customerId) {
  const conversationsRef = collection(db, 'tenants', tenantId, 'conversations');
  const q = query(conversationsRef, where('customerId', '==', customerId));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get conversation for job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>}
 */
export async function getJobConversation(tenantId, jobId) {
  const conversationsRef = collection(db, 'tenants', tenantId, 'conversations');
  const q = query(conversationsRef, where('jobId', '==', jobId));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get all conversations for tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getAllConversations(tenantId) {
  const conversationsRef = collection(db, 'tenants', tenantId, 'conversations');
  const q = query(conversationsRef, orderBy('updatedAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get conversations for a user
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
export async function getUserConversations(tenantId, userId) {
  const conversationsRef = collection(db, 'tenants', tenantId, 'conversations');
  const q = query(conversationsRef, orderBy('updatedAt', 'desc'));
  const snapshot = await getDocs(q);
  
  const allConversations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Filter conversations where user is a participant
  return allConversations.filter(conv => 
    conv.participants && conv.participants.some(p => p.id === userId)
  );
}

/**
 * Get messages for a conversation
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Array>}
 */
export async function getMessages(tenantId, conversationId) {
  const messagesRef = collection(db, 'tenants', tenantId, 'conversations', conversationId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to messages for a conversation
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @param {function} callback - Callback function for updates
 * @returns {function} Unsubscribe function
 */
export function subscribeToMessages(tenantId, conversationId, callback) {
  const messagesRef = collection(db, 'tenants', tenantId, 'conversations', conversationId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(messages);
  });
}

/**
 * Subscribe to conversation updates
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @param {function} callback - Callback function for updates
 * @returns {function} Unsubscribe function
 */
export function subscribeToConversation(tenantId, conversationId, callback) {
  const conversationRef = doc(db, 'tenants', tenantId, 'conversations', conversationId);
  
  return onSnapshot(conversationRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() });
    }
  });
}

/**
 * Add participant to conversation
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @param {object} participant - Participant data
 * @returns {Promise<void>}
 */
export async function addParticipant(tenantId, conversationId, participant) {
  const conversationRef = doc(db, 'tenants', tenantId, 'conversations', conversationId);
  const conversationSnap = await getDoc(conversationRef);
  
  if (!conversationSnap.exists()) {
    throw new Error('Conversation not found');
  }
  
  const conversation = conversationSnap.data();
  const participants = conversation.participants || [];
  
  // Check if participant already exists
  if (participants.some(p => p.id === participant.id)) {
    return;
  }
  
  participants.push(participant);
  
  await updateDoc(conversationRef, {
    participants,
    updatedAt: serverTimestamp()
  });
}

/**
 * Remove participant from conversation
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @param {string} participantId - Participant ID to remove
 * @returns {Promise<void>}
 */
export async function removeParticipant(tenantId, conversationId, participantId) {
  const conversationRef = doc(db, 'tenants', tenantId, 'conversations', conversationId);
  const conversationSnap = await getDoc(conversationRef);
  
  if (!conversationSnap.exists()) {
    throw new Error('Conversation not found');
  }
  
  const conversation = conversationSnap.data();
  const participants = conversation.participants || [];
  
  const updatedParticipants = participants.filter(p => p.id !== participantId);
  
  await updateDoc(conversationRef, {
    participants: updatedParticipants,
    updatedAt: serverTimestamp()
  });
}

/**
 * Archive conversation
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<void>}
 */
export async function archiveConversation(tenantId, conversationId) {
  const conversationRef = doc(db, 'tenants', tenantId, 'conversations', conversationId);
  await updateDoc(conversationRef, {
    status: 'archived',
    updatedAt: serverTimestamp()
  });
}

/**
 * Get messaging analytics
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getMessagingAnalytics(tenantId, startDate, endDate) { // eslint-disable-line no-unused-vars
  const conversationsRef = collection(db, 'tenants', tenantId, 'conversations');
  const q = query(conversationsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  
  const conversations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let totalConversations = conversations.length;
  let activeConversations = 0;
  let archivedConversations = 0;
  let totalMessages = 0;
  let totalUnread = 0;
  
  for (const conv of conversations) {
    if (conv.status === 'active') {
      activeConversations++;
    } else if (conv.status === 'archived') {
      archivedConversations++;
    }
    
    // Count total unread
    if (conv.unreadCount) {
      totalUnread += Object.values(conv.unreadCount).reduce((a, b) => a + b, 0);
    }
    
    // Get message count
    try {
      const messages = await getMessages(tenantId, conv.id);
      totalMessages += messages.length;
    } catch {
      // Skip if messages can't be retrieved
    }
  }
  
  return {
    totalConversations,
    activeConversations,
    archivedConversations,
    totalMessages,
    totalUnread,
    averageMessagesPerConversation: totalConversations > 0 ? Math.round(totalMessages / totalConversations) : 0
  };
}
