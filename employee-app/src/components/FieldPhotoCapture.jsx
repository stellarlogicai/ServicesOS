import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Button, Image, StyleSheet, Text, TextInput, View } from "react-native";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { createFieldPhotoClientUploadId, uploadFieldPhoto } from "../api/fieldPhotos";

const MAX_ROOM_LABEL_LENGTH = 80;
const MAX_NOTE_LENGTH = 500;
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UPLOAD_ERROR = "This photo could not be uploaded. Try again.";

function photoAssetFromPicker(asset, fileSize) {
  if (!asset || typeof asset.uri !== "string" || !asset.uri ||
      !ALLOWED_MIME_TYPES.has(asset.mimeType) ||
      !Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_SIZE_BYTES) {
    return null;
  }
  return {
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileSize,
    fileName: typeof asset.fileName === "string" ? asset.fileName : null,
    width: Number.isInteger(asset.width) ? asset.width : null,
    height: Number.isInteger(asset.height) ? asset.height : null,
    type: asset.type,
    rotation: asset.rotation,
  };
}

async function normalizePickedAsset(asset) {
  const info = await FileSystem.getInfoAsync(asset?.uri, { size: true });
  const fileSize = info?.exists === true ? info.size : null;
  return photoAssetFromPicker(asset, fileSize);
}

async function pickImage(source) {
  const permission = source === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { error: "Photo permission is required to add evidence." };
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
  if (result.canceled) return {};
  try {
    const asset = await normalizePickedAsset(result.assets?.[0]);
    if (!asset) {
      return { error: "Choose a JPEG, PNG, or WebP image no larger than 10 MB." };
    }
    return { asset };
  } catch {
    return { error: "This image could not be prepared for upload." };
  }
}

function ExistingPhotoLabels({ photos }) {
  if (!photos.length) return <Text style={styles.muted}>No uploaded photos yet.</Text>;
  return (
    <View style={styles.photoLabels}>
      {photos.map(photo => (
        <Text key={photo.id} style={styles.photoLabel}>
          Uploaded: {photo.roomLabel}{photo.note ? ` - ${photo.note}` : ""}
        </Text>
      ))}
    </View>
  );
}

export default function FieldPhotoCapture({
  phase,
  tenantId,
  bookingId,
  photos,
  disabled,
  onUploaded,
}) {
  const mounted = useRef(true);
  const requestId = useRef(0);
  const uploadInFlight = useRef(false);
  const [asset, setAsset] = useState(null);
  const [roomLabel, setRoomLabel] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    mounted.current = false;
    requestId.current += 1;
  }, []);

  useEffect(() => {
    // A selected asset and its idempotency key are scoped to one booking only.
    requestId.current += 1;
    uploadInFlight.current = false;
    setAsset(null);
    setRoomLabel("");
    setNote("");
    setUploading(false);
    setError("");
  }, [bookingId]);

  const select = async source => {
    if (disabled || uploading) return;
    const request = ++requestId.current;
    setError("");
    let result;
    try {
      result = await pickImage(source);
    } catch {
      result = { error: "This image could not be prepared for upload." };
    }
    if (!mounted.current || request !== requestId.current) return;
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.asset) setAsset({ ...result.asset, clientUploadId: createFieldPhotoClientUploadId() });
  };

  const submit = async () => {
    if (disabled || uploading || uploadInFlight.current || !asset) return;
    const { clientUploadId, ...uploadAsset } = asset;
    const normalizedRoomLabel = roomLabel.trim();
    const normalizedNote = note.trim();
    if (!normalizedRoomLabel) {
      setError("Add the room or area for this photo.");
      return;
    }
    const request = ++requestId.current;
    uploadInFlight.current = true;
    setUploading(true);
    setError("");
    try {
      const photo = await uploadFieldPhoto({
        tenantId,
        bookingId,
        clientUploadId,
        phase,
        roomLabel: normalizedRoomLabel,
        note: normalizedNote,
        asset: uploadAsset,
      });
      if (!mounted.current || request !== requestId.current) return;
      onUploaded({
        id: photo.id,
        phase,
        roomLabel: normalizedRoomLabel,
        note: normalizedNote,
      });
      setAsset(null);
      setRoomLabel("");
      setNote("");
    } catch {
      if (mounted.current && request === requestId.current) setError(UPLOAD_ERROR);
    } finally {
      if (mounted.current && request === requestId.current) setUploading(false);
      if (request === requestId.current) uploadInFlight.current = false;
    }
  };

  const title = phase === "before" ? "Before Photos" : "After Photos";
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.count}>{photos.length} uploaded</Text>
      <ExistingPhotoLabels photos={photos} />
      {asset ? (
        <View style={styles.draft}>
          <Image source={{ uri: asset.uri }} style={styles.preview} accessibilityLabel={`${title} preview`} />
          <TextInput
            accessibilityLabel={`${title} room or area`}
            editable={!disabled && !uploading}
            maxLength={MAX_ROOM_LABEL_LENGTH}
            onChangeText={value => setRoomLabel(value.slice(0, MAX_ROOM_LABEL_LENGTH))}
            placeholder="Room or area"
            style={styles.input}
            value={roomLabel}
          />
          <TextInput
            accessibilityLabel={`${title} note`}
            editable={!disabled && !uploading}
            maxLength={MAX_NOTE_LENGTH}
            multiline
            onChangeText={value => setNote(value.slice(0, MAX_NOTE_LENGTH))}
            placeholder="Optional note"
            style={[styles.input, styles.note]}
            value={note}
          />
          <Button
            title={uploading ? "Uploading..." : `Upload ${phase} photo`}
            disabled={disabled || uploading}
            onPress={submit}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <Button title="Take Photo" disabled={disabled || uploading} onPress={() => select("camera")} />
          <Button title="Choose from Library" disabled={disabled || uploading} onPress={() => select("library")} />
        </View>
      )}
      {uploading ? <ActivityIndicator accessibilityRole="progressbar" style={styles.progress} /> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4 },
  title: { color: "#1e293b", fontSize: 16, fontWeight: "700", marginBottom: 4 },
  count: { color: "#475569", marginBottom: 6 },
  muted: { color: "#64748b", marginBottom: 10 },
  photoLabels: { marginBottom: 10 },
  photoLabel: { color: "#475569", marginBottom: 3 },
  actions: { gap: 8 },
  draft: { gap: 10 },
  preview: { width: "100%", aspectRatio: 4 / 3, borderRadius: 6, backgroundColor: "#e2e8f0" },
  input: { borderWidth: 1, borderColor: "#94a3b8", borderRadius: 6, padding: 10, backgroundColor: "#fff" },
  note: { minHeight: 72, textAlignVertical: "top" },
  progress: { marginTop: 10 },
  error: { color: "#b91c1c", marginTop: 10 },
});

export { normalizePickedAsset, photoAssetFromPicker };
