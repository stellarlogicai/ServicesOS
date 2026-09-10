import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockGetInfoAsync = jest.fn();
const mockRequestCameraPermissions = jest.fn();
const mockRequestLibraryPermissions = jest.fn();
const mockLaunchCamera = jest.fn();
const mockLaunchLibrary = jest.fn();
const mockUpload = jest.fn();
const mockClientUploadId = jest.fn(() => "field_photo_upload_0001");

jest.mock("expo-file-system", () => ({ getInfoAsync: (...args) => mockGetInfoAsync(...args) }));
jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "images" },
  requestCameraPermissionsAsync: (...args) => mockRequestCameraPermissions(...args),
  requestMediaLibraryPermissionsAsync: (...args) => mockRequestLibraryPermissions(...args),
  launchCameraAsync: (...args) => mockLaunchCamera(...args),
  launchImageLibraryAsync: (...args) => mockLaunchLibrary(...args),
}));
jest.mock("../../api/fieldPhotos", () => ({
  createFieldPhotoClientUploadId: (...args) => mockClientUploadId(...args),
  uploadFieldPhoto: (...args) => mockUpload(...args),
}));

import FieldPhotoCapture, { normalizePickedAsset } from "../FieldPhotoCapture";

const asset = {
  uri: "file:///cache/photo.jpg",
  mimeType: "image/jpeg",
  fileSize: 128,
  fileName: "photo.jpg",
  width: 100,
  height: 80,
  type: "image",
  rotation: null,
};

function renderCapture(props = {}) {
  return render(<FieldPhotoCapture
    bookingId="booking-a"
    disabled={false}
    onUploaded={jest.fn()}
    phase="before"
    photos={[]}
    tenantId="tenant-a"
    {...props}
  />);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestCameraPermissions.mockResolvedValue({ granted: true });
  mockRequestLibraryPermissions.mockResolvedValue({ granted: true });
  mockLaunchCamera.mockResolvedValue({ canceled: false, assets: [asset] });
  mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [asset] });
  mockUpload.mockResolvedValue({ id: "photo-a" });
});

test("camera selection keeps an ImagePicker asset local until upload", async () => {
  renderCapture();
  await act(async () => fireEvent.press(screen.getByText("Take Photo")));
  expect(mockLaunchCamera).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Before Photos preview")).toBeTruthy();
  expect(mockUpload).not.toHaveBeenCalled();
});

test("picker cancellation is quiet and a denied permission is actionable", async () => {
  mockLaunchCamera.mockResolvedValueOnce({ canceled: true });
  renderCapture();
  await act(async () => fireEvent.press(screen.getByText("Take Photo")));
  expect(screen.queryByLabelText("Before Photos preview")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();

  mockRequestCameraPermissions.mockResolvedValueOnce({ granted: false });
  await act(async () => fireEvent.press(screen.getByText("Take Photo")));
  expect(await screen.findByText("Photo permission is required to add evidence.")).toBeTruthy();
});

test("missing fileSize uses FileSystem metadata without base64", async () => {
  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 222 });
  await expect(normalizePickedAsset({ ...asset, fileSize: undefined })).resolves.toMatchObject({ fileSize: 222 });
  expect(mockGetInfoAsync).toHaveBeenCalledWith(asset.uri, { size: true });
});

test("missing or unsupported MIME is rejected rather than defaulted", async () => {
  await expect(normalizePickedAsset({ ...asset, mimeType: null })).resolves.toBeNull();
  await expect(normalizePickedAsset({ ...asset, mimeType: "image/gif" })).resolves.toBeNull();
});

test("upload receives a stable id and only selected asset metadata", async () => {
  const onUploaded = jest.fn();
  renderCapture({ onUploaded });
  await act(async () => fireEvent.press(screen.getByText("Choose from Library")));
  fireEvent.changeText(screen.getByLabelText("Before Photos room or area"), "Kitchen");
  fireEvent.changeText(screen.getByLabelText("Before Photos note"), "Before work");
  await act(async () => fireEvent.press(screen.getByText("Upload before photo")));
  expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({
    tenantId: "tenant-a", bookingId: "booking-a", clientUploadId: "field_photo_upload_0001",
    phase: "before", roomLabel: "Kitchen", note: "Before work",
    asset: expect.objectContaining({ uri: asset.uri, mimeType: "image/jpeg", fileSize: 128 }),
  }));
  expect(onUploaded).toHaveBeenCalledWith({ id: "photo-a", phase: "before", roomLabel: "Kitchen", note: "Before work" });
});

test("room is required and note input remains bounded", async () => {
  renderCapture();
  await act(async () => fireEvent.press(screen.getByText("Take Photo")));
  fireEvent.changeText(screen.getByLabelText("Before Photos note"), "n".repeat(505));
  expect(screen.getByLabelText("Before Photos note").props.value).toHaveLength(500);
  await act(async () => fireEvent.press(screen.getByText("Upload before photo")));
  expect(await screen.findByText("Add the room or area for this photo.")).toBeTruthy();
  expect(mockUpload).not.toHaveBeenCalled();
});

test("after capture passes only the after phase to the existing transport", async () => {
  renderCapture({ phase: "after" });
  await act(async () => fireEvent.press(screen.getByText("Take Photo")));
  fireEvent.changeText(screen.getByLabelText("After Photos room or area"), "Kitchen");
  await act(async () => fireEvent.press(screen.getByText("Upload after photo")));
  expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ phase: "after" }));
});

test("upload failure retains the local selection and stable id for retry", async () => {
  mockUpload.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ id: "photo-a" });
  renderCapture();
  await act(async () => fireEvent.press(screen.getByText("Take Photo")));
  fireEvent.changeText(screen.getByLabelText("Before Photos room or area"), "Kitchen");
  await act(async () => fireEvent.press(screen.getByText("Upload before photo")));
  expect(await screen.findByText("This photo could not be uploaded. Try again.")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText("Upload before photo")));
  expect(mockUpload.mock.calls[0][0].clientUploadId).toBe(mockUpload.mock.calls[1][0].clientUploadId);
});

test("a booking change clears the selected draft and never reuses its upload id", async () => {
  const view = renderCapture();
  await act(async () => fireEvent.press(screen.getByText("Take Photo")));
  fireEvent.changeText(screen.getByLabelText("Before Photos room or area"), "Kitchen");
  fireEvent.changeText(screen.getByLabelText("Before Photos note"), "Job A draft");

  view.rerender(
    <FieldPhotoCapture
      bookingId="booking-b"
      disabled={false}
      onUploaded={jest.fn()}
      phase="before"
      photos={[]}
      tenantId="tenant-a"
    />
  );

  expect(screen.queryByLabelText("Before Photos preview")).toBeNull();
  expect(screen.queryByLabelText("Before Photos room or area")).toBeNull();
  expect(screen.queryByText("Job A draft")).toBeNull();
  expect(mockUpload).not.toHaveBeenCalled();
});

test("duplicate submission is disabled while upload is pending", async () => {
  const pending = deferred();
  mockUpload.mockReturnValue(pending.promise);
  renderCapture();
  await act(async () => fireEvent.press(screen.getByText("Take Photo")));
  fireEvent.changeText(screen.getByLabelText("Before Photos room or area"), "Kitchen");
  const upload = screen.getByText("Upload before photo");
  await act(async () => {
    fireEvent.press(upload);
    fireEvent.press(upload);
    await Promise.resolve();
  });
  expect(mockUpload).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ id: "photo-a" }));
});

test("late upload completion after navigation does not update the next job", async () => {
  const pending = deferred();
  const onUploaded = jest.fn();
  mockUpload.mockReturnValue(pending.promise);
  const view = renderCapture({ onUploaded });
  await act(async () => fireEvent.press(screen.getByText("Take Photo")));
  fireEvent.changeText(screen.getByLabelText("Before Photos room or area"), "Kitchen");
  await act(async () => {
    fireEvent.press(screen.getByText("Upload before photo"));
    await Promise.resolve();
  });
  view.unmount();
  await act(async () => pending.resolve({ id: "photo-a" }));
  expect(onUploaded).not.toHaveBeenCalled();
});
