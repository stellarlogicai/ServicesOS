// src/screens/MessagesScreen.jsx
/**
 * Messages Screen
 * 
 * This screen displays messages between the employee and the office.
 * Shows message threads and allows sending new messages.
 */

import React, { useContext, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TextInput, Button } from "react-native";
import { AuthContext } from "../context/AuthContext";

export default function MessagesScreen() {
  const { employee } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");

  async function loadMessages() {
    try {
      setLoading(true);
      // TODO: Implement actual message loading from Firestore
      // For now, using placeholder data
      setMessages([
        {
          id: "1",
          sender: "Office",
          body: "Remember to check the back door for the Smith job",
          timestamp: "2024-01-20 08:30",
        },
        {
          id: "2",
          sender: "You",
          body: "Got it, will do",
          timestamp: "2024-01-20 08:35",
        },
        {
          id: "3",
          sender: "Office",
          body: "New job added for tomorrow at 2pm",
          timestamp: "2024-01-20 14:00",
        },
      ]);
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim()) return;

    try {
      // TODO: Implement actual message sending to Firestore
      console.log("Sending message:", newMessage);
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  }

  useEffect(() => {
    if (employee) {
      loadMessages();
    }
  }, [employee]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading messages...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Messages</Text>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[
            styles.messageCard,
            item.sender === "You" ? styles.sentMessage : styles.receivedMessage
          ]}>
            <Text style={styles.sender}>{item.sender}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.timestamp}>{item.timestamp}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No messages</Text>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
        />
        <Button title="Send" onPress={sendMessage} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  messageCard: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    maxWidth: "80%",
  },
  sentMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#007AFF",
  },
  receivedMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#E5E5EA",
  },
  sender: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#666",
  },
  body: {
    fontSize: 16,
    marginBottom: 5,
    color: "#000",
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    marginTop: 20,
  },
  inputContainer: {
    flexDirection: "row",
    marginTop: 10,
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    maxHeight: 100,
  },
});
