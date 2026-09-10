const ADDRESS_PLACEHOLDER = "address not provided";
const DIRECTIONS_ERROR = "Unable to open directions. Please open your maps app and enter the service address manually.";

class EmployeeNavigationError extends Error {
  constructor(message = DIRECTIONS_ERROR, code = "directions_unavailable") {
    super(message);
    this.name = "EmployeeNavigationError";
    this.code = code;
  }
}

function usableAddress(value) {
  const address = typeof value === "string" ? value.trim() : "";
  return address && address.toLowerCase() !== ADDRESS_PLACEHOLDER ? address : "";
}

function navigationUrls(address, platform) {
  const normalizedAddress = usableAddress(address);
  if (!normalizedAddress) {
    throw new EmployeeNavigationError("Directions are unavailable for this job.", "address_unavailable");
  }

  const encodedAddress = encodeURIComponent(normalizedAddress);
  const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  const primaryUrl = platform === "android"
    ? `geo:0,0?q=${encodedAddress}`
    : platform === "ios"
      ? `https://maps.apple.com/?q=${encodedAddress}`
      : fallbackUrl;

  return { primaryUrl, fallbackUrl };
}

function createEmployeeNavigationClient({ platform, openURL }) {
  if (typeof openURL !== "function") {
    throw new Error("[Employee Navigation] openURL is required.");
  }

  return {
    async openDirections(address, { isCurrent = () => true } = {}) {
      const { primaryUrl, fallbackUrl } = navigationUrls(address, platform);
      if (!isCurrent()) {
        throw new EmployeeNavigationError(DIRECTIONS_ERROR, "stale_navigation");
      }

      try {
        await openURL(primaryUrl);
        return { opened: true };
      } catch {
        if (!isCurrent()) {
          throw new EmployeeNavigationError(DIRECTIONS_ERROR, "stale_navigation");
        }
        if (primaryUrl === fallbackUrl) {
          throw new EmployeeNavigationError();
        }
        try {
          await openURL(fallbackUrl);
          return { opened: true };
        } catch {
          throw new EmployeeNavigationError();
        }
      }
    },
  };
}

module.exports = {
  DIRECTIONS_ERROR,
  EmployeeNavigationError,
  createEmployeeNavigationClient,
  navigationUrls,
  usableAddress,
};
