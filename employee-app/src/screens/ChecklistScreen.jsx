// src/screens/ChecklistScreen.jsx
/**
 * Checklist Screen
 * 
 * This screen displays the checklist for a specific job.
 * Allows employees to mark items as completed and add notes.
 */

import React, { useContext, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TextInput, Button, Alert } from "react-native";
import { AuthContext } from "../context/AuthContext";
import { getChecklistItems, toggleChecklistItem, addChecklistItemNote } from "../api/checklists";

export default function ChecklistScreen({ route }) {
  const { jobId } = route.params;
  const { employee } = useContext(AuthContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteInput, setNoteInput] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);

  async function loadItems() {
    try {
      setLoading(true);
      const data = await getChecklistItems(jobId);
      setItems(data);
    } catch (error) {
      console.error("Error loading checklist:", error);
      Alert.alert("Error", "Failed to load checklist");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(item) {
    try {
      await toggleChecklistItem(jobId, item.id, employee.id, !item.completed);
      await loadItems();
    } catch (error) {
      console.error("Error toggling item:", error);
      Alert.alert("Error", "Failed to update checklist item");
    }
  }

  async function handleSaveNote() {
    if (!selectedItem || !noteInput.trim()) {
      return;
    }

    try {
      await addChecklistItemNote(jobId, selectedItem.id, noteInput.trim());
      setNoteInput("");
      setSelectedItem(null);
      await loadItems();
    } catch (error) {
      console.error("Error saving note:", error);
      Alert.alert("Error", "Failed to save note");
    }
  }

  useEffect(() => {
    loadItems();
  }, [jobId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading checklist...</Text>
      </View>
    );
  }

  const completedCount = items.filter((item) => item.completed).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Checklist</Text>
      <Text style={styles.progress}>{progress}% Complete ({completedCount}/{totalCount})</Text>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.itemCard, item.completed && styles.completedItem]}>
            <View style={styles.itemHeader}>
              <Text style={styles.area}>{item.area || "General"}</Text>
              <Text style={styles.title}>{item.title}</Text>
            </View>
            
            {item.required && (
              <Text style={styles.required}>Required</Text>
            )}

            {item.completed && (
              <Text style={styles.completedBy}>
                Completed by {item.completedBy} at {item.completedAt}
              </Text>
            )}

            {item.note && (
              <Text style={styles.note}>Note: {item.note}</Text>
            )}

            <View style={styles.buttonRow}>
              <Button
                title={item.completed ? "Undo" : "Complete"}
                onPress={() => handleToggle(item)}
              />
              <Button
                title="Add Note"
                onPress={() => setSelectedItem(item)}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No checklist items for this job</Text>
        }
      />

      {selectedItem && (
        <View style={styles.noteModal}>
          <Text style={styles.noteTitle}>Add Note for: {selectedItem.title}</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Enter note..."
            value={noteInput}
            onChangeText={setNoteInput}
            multiline
          />
          <View style={styles.noteButtons}>
            <Button title="Cancel" onPress={() => { setSelectedItem(null); setNoteInput(""); }} />
            <Button title="Save" onPress={handleSaveNote} />
          </View>
        </View>
      )}
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
    marginBottom: 5,
  },
  progress: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#f9f9f9",
  },
  completedItem: {
    backgroundColor: "#e8f5e9",
    borderColor: "#4caf50",
  },
  itemHeader: {
    marginBottom: 8,
  },
  area: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
  },
  required: {
    fontSize: 12,
    color: "red",
    marginBottom: 5,
  },
  completedBy: {
    fontSize: 12,
    color: "green",
    marginBottom: 5,
  },
  note: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    marginTop: 20,
  },
  noteModal: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    elevation: 5,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    minHeight: 80,
  },
  noteButtons: {
    flexDirection: "row",
    gap: 10,
  },
});
