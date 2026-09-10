const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  DIRECTIONS_ERROR,
  EmployeeNavigationError,
  createEmployeeNavigationClient,
  navigationUrls,
  usableAddress,
} = require("../employeeNavigationClient");

const ADDRESS = "123 Main St, Apt #4B & Suite 200";
const ENCODED_ADDRESS = "123%20Main%20St%2C%20Apt%20%234B%20%26%20Suite%20200";

test("Android directions use an encoded geo address URI", () => {
  assert.deepEqual(navigationUrls(ADDRESS, "android"), {
    primaryUrl: `geo:0,0?q=${ENCODED_ADDRESS}`,
    fallbackUrl: `https://www.google.com/maps/search/?api=1&query=${ENCODED_ADDRESS}`,
  });
});

test("iOS directions use an encoded Apple Maps URL", () => {
  assert.deepEqual(navigationUrls(ADDRESS, "ios"), {
    primaryUrl: `https://maps.apple.com/?q=${ENCODED_ADDRESS}`,
    fallbackUrl: `https://www.google.com/maps/search/?api=1&query=${ENCODED_ADDRESS}`,
  });
});

test("unknown platforms use the HTTPS fallback directly", () => {
  const urls = navigationUrls(ADDRESS, "web");
  assert.equal(urls.primaryUrl, urls.fallbackUrl);
  assert.match(urls.primaryUrl, /^https:\/\//);
});

test("valid addresses retain complete apartment and suite text", () => {
  assert.equal(usableAddress(`  ${ADDRESS}  `), ADDRESS);
});

test("empty, whitespace, and placeholder addresses are unavailable", () => {
  [null, undefined, "", "   ", "Address not provided", " ADDRESS NOT PROVIDED "].forEach(value => {
    assert.equal(usableAddress(value), "");
    assert.throws(() => navigationUrls(value, "android"), error => (
      error instanceof EmployeeNavigationError && error.code === "address_unavailable"
    ));
  });
});

test("Android native-open failure uses the same encoded HTTPS fallback", async () => {
  const calls = [];
  const client = createEmployeeNavigationClient({
    platform: "android",
    openURL: async url => {
      calls.push(url);
      if (calls.length === 1) throw new Error("No map handler");
    },
  });

  assert.deepEqual(await client.openDirections(ADDRESS), { opened: true });
  assert.deepEqual(calls, [
    `geo:0,0?q=${ENCODED_ADDRESS}`,
    `https://www.google.com/maps/search/?api=1&query=${ENCODED_ADDRESS}`,
  ]);
});

test("iOS native-open failure uses the same encoded HTTPS fallback", async () => {
  const calls = [];
  const client = createEmployeeNavigationClient({
    platform: "ios",
    openURL: async url => {
      calls.push(url);
      if (calls.length === 1) throw new Error("Apple Maps unavailable");
    },
  });

  await client.openDirections(ADDRESS);
  assert.deepEqual(calls, [
    `https://maps.apple.com/?q=${ENCODED_ADDRESS}`,
    `https://www.google.com/maps/search/?api=1&query=${ENCODED_ADDRESS}`,
  ]);
});

test("fallback failure returns only a controlled generic error", async () => {
  const client = createEmployeeNavigationClient({
    platform: "android",
    openURL: async () => { throw new Error("private platform detail"); },
  });

  await assert.rejects(
    client.openDirections(ADDRESS),
    error => error instanceof EmployeeNavigationError &&
      error.code === "directions_unavailable" &&
      error.message === DIRECTIONS_ERROR
  );
});

test("a replaced job prevents a late native failure from opening its fallback", async () => {
  const calls = [];
  let current = true;
  const client = createEmployeeNavigationClient({
    platform: "android",
    openURL: async url => {
      calls.push(url);
      current = false;
      throw new Error("No map handler");
    },
  });

  await assert.rejects(
    client.openDirections(ADDRESS, { isCurrent: () => current }),
    error => error instanceof EmployeeNavigationError && error.code === "stale_navigation"
  );
  assert.deepEqual(calls, [`geo:0,0?q=${ENCODED_ADDRESS}`]);
});

test("navigation uses Linking only and introduces no location, map SDK, or Firestore access", () => {
  const sourceFiles = [
    path.resolve(__dirname, "..", "employeeNavigationClient.js"),
    path.resolve(__dirname, "..", "employeeNavigation.js"),
    path.resolve(__dirname, "..", "..", "screens", "JobDetailsScreen.jsx"),
  ];
  const source = sourceFiles.map(file => fs.readFileSync(file, "utf8")).join("\n");

  assert.doesNotMatch(source, /expo-location|react-native-maps|firebase\/firestore|getDoc|getDocs|onSnapshot|collection\s*\(/);
  assert.doesNotMatch(source, /geocod|AsyncStorage|latitude|longitude|requestForegroundPermissions|requestBackgroundPermissions/);
});
