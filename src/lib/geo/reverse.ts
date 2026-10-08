/**
 * Client-only reverse geocode: state/province + country.
 * Never sent to the Cree Sanctum server as coordinates.
 * A mocked device can still lie.
 */

type Region = { admin1: string; country: string };

const US_STATES: { name: string; minLat: number; minLon: number; maxLat: number; maxLon: number }[] = [
  { name: "Alabama", minLat: 30.2, minLon: -88.5, maxLat: 35.0, maxLon: -84.9 },
  { name: "Alaska", minLat: 51.2, minLon: -179.1, maxLat: 71.4, maxLon: -129.9 },
  { name: "Arizona", minLat: 31.3, minLon: -114.8, maxLat: 37.0, maxLon: -109.0 },
  { name: "Arkansas", minLat: 33.0, minLon: -94.6, maxLat: 36.5, maxLon: -89.6 },
  { name: "California", minLat: 32.5, minLon: -124.5, maxLat: 42.0, maxLon: -114.1 },
  { name: "Colorado", minLat: 37.0, minLon: -109.1, maxLat: 41.0, maxLon: -102.0 },
  { name: "Connecticut", minLat: 40.9, minLon: -73.7, maxLat: 42.1, maxLon: -71.8 },
  { name: "Delaware", minLat: 38.4, minLon: -75.8, maxLat: 39.8, maxLon: -75.0 },
  { name: "Florida", minLat: 24.5, minLon: -87.6, maxLat: 31.0, maxLon: -80.0 },
  { name: "Georgia", minLat: 30.4, minLon: -85.6, maxLat: 35.0, maxLon: -80.8 },
  { name: "Hawaii", minLat: 18.9, minLon: -160.3, maxLat: 22.2, maxLon: -154.8 },
  { name: "Idaho", minLat: 42.0, minLon: -117.2, maxLat: 49.0, maxLon: -111.0 },
  { name: "Illinois", minLat: 37.0, minLon: -91.5, maxLat: 42.5, maxLon: -87.5 },
  { name: "Indiana", minLat: 37.8, minLon: -88.1, maxLat: 41.8, maxLon: -84.8 },
  { name: "Iowa", minLat: 40.4, minLon: -96.6, maxLat: 43.5, maxLon: -90.1 },
  { name: "Kansas", minLat: 37.0, minLon: -102.1, maxLat: 40.0, maxLon: -94.6 },
  { name: "Kentucky", minLat: 36.5, minLon: -89.6, maxLat: 39.1, maxLon: -81.9 },
  { name: "Louisiana", minLat: 29.0, minLon: -94.0, maxLat: 33.0, maxLon: -88.8 },
  { name: "Maine", minLat: 43.1, minLon: -71.1, maxLat: 47.5, maxLon: -66.9 },
  { name: "Maryland", minLat: 37.9, minLon: -79.5, maxLat: 39.7, maxLon: -75.0 },
  { name: "Massachusetts", minLat: 41.2, minLon: -73.5, maxLat: 42.9, maxLon: -69.9 },
  { name: "Michigan", minLat: 41.7, minLon: -90.4, maxLat: 48.3, maxLon: -82.4 },
  { name: "Minnesota", minLat: 43.5, minLon: -97.2, maxLat: 49.4, maxLon: -89.5 },
  { name: "Mississippi", minLat: 30.2, minLon: -91.6, maxLat: 35.0, maxLon: -88.1 },
  { name: "Missouri", minLat: 36.0, minLon: -95.8, maxLat: 40.6, maxLon: -89.1 },
  { name: "Montana", minLat: 44.4, minLon: -116.1, maxLat: 49.0, maxLon: -104.0 },
  { name: "Nebraska", minLat: 40.0, minLon: -104.1, maxLat: 43.0, maxLon: -95.3 },
  { name: "Nevada", minLat: 35.0, minLon: -120.0, maxLat: 42.0, maxLon: -114.0 },
  { name: "New Hampshire", minLat: 42.7, minLon: -72.6, maxLat: 45.3, maxLon: -70.6 },
  { name: "New Jersey", minLat: 38.9, minLon: -75.6, maxLat: 41.4, maxLon: -73.9 },
  { name: "New Mexico", minLat: 31.3, minLon: -109.1, maxLat: 37.0, maxLon: -103.0 },
  { name: "New York", minLat: 40.5, minLon: -79.8, maxLat: 45.0, maxLon: -71.9 },
  { name: "North Carolina", minLat: 33.8, minLon: -84.3, maxLat: 36.6, maxLon: -75.5 },
  { name: "North Dakota", minLat: 45.9, minLon: -104.1, maxLat: 49.0, maxLon: -96.6 },
  { name: "Ohio", minLat: 38.4, minLon: -84.8, maxLat: 42.0, maxLon: -80.5 },
  { name: "Oklahoma", minLat: 33.6, minLon: -103.0, maxLat: 37.0, maxLon: -94.4 },
  { name: "Oregon", minLat: 42.0, minLon: -124.6, maxLat: 46.3, maxLon: -116.5 },
  { name: "Pennsylvania", minLat: 39.7, minLon: -80.5, maxLat: 42.3, maxLon: -74.7 },
  { name: "Rhode Island", minLat: 41.1, minLon: -71.9, maxLat: 42.0, maxLon: -71.1 },
  { name: "South Carolina", minLat: 32.0, minLon: -83.4, maxLat: 35.2, maxLon: -78.5 },
  { name: "South Dakota", minLat: 42.5, minLon: -104.1, maxLat: 46.0, maxLon: -96.4 },
  { name: "Tennessee", minLat: 35.0, minLon: -90.3, maxLat: 36.7, maxLon: -81.6 },
  { name: "Texas", minLat: 25.8, minLon: -106.6, maxLat: 36.5, maxLon: -93.5 },
  { name: "Utah", minLat: 37.0, minLon: -114.1, maxLat: 42.0, maxLon: -109.0 },
  { name: "Vermont", minLat: 42.7, minLon: -73.4, maxLat: 45.0, maxLon: -71.5 },
  { name: "Virginia", minLat: 36.5, minLon: -83.7, maxLat: 39.5, maxLon: -75.2 },
  { name: "Washington", minLat: 45.5, minLon: -124.8, maxLat: 49.0, maxLon: -116.9 },
  { name: "West Virginia", minLat: 37.2, minLon: -82.6, maxLat: 40.6, maxLon: -77.7 },
  { name: "Wisconsin", minLat: 42.5, minLon: -92.9, maxLat: 47.1, maxLon: -86.8 },
  { name: "Wyoming", minLat: 41.0, minLon: -111.1, maxLat: 45.0, maxLon: -104.1 },
  { name: "District of Columbia", minLat: 38.8, minLon: -77.1, maxLat: 39.0, maxLon: -76.9 },
];

const COUNTRIES: { name: string; minLat: number; minLon: number; maxLat: number; maxLon: number }[] = [
  { name: "United States", minLat: 24.5, minLon: -125.0, maxLat: 49.4, maxLon: -66.9 },
  { name: "Canada", minLat: 41.7, minLon: -141.0, maxLat: 83.1, maxLon: -52.6 },
  { name: "Mexico", minLat: 14.5, minLon: -118.4, maxLat: 32.7, maxLon: -86.7 },
  { name: "United Kingdom", minLat: 49.9, minLon: -8.6, maxLat: 58.7, maxLon: 1.8 },
  { name: "Ireland", minLat: 51.4, minLon: -10.5, maxLat: 55.4, maxLon: -6.0 },
  { name: "France", minLat: 41.3, minLon: -5.1, maxLat: 51.1, maxLon: 9.6 },
  { name: "Germany", minLat: 47.3, minLon: 5.9, maxLat: 55.1, maxLon: 15.0 },
  { name: "Spain", minLat: 36.0, minLon: -9.3, maxLat: 43.8, maxLon: 3.3 },
  { name: "Italy", minLat: 36.6, minLon: 6.6, maxLat: 47.1, maxLon: 18.5 },
  { name: "Australia", minLat: -43.6, minLon: 113.2, maxLat: -10.7, maxLon: 153.6 },
  { name: "New Zealand", minLat: -47.3, minLon: 166.4, maxLat: -34.4, maxLon: 178.6 },
  { name: "Japan", minLat: 24.2, minLon: 123.0, maxLat: 45.5, maxLon: 145.8 },
  { name: "Brazil", minLat: -33.7, minLon: -73.9, maxLat: 5.3, maxLon: -34.8 },
  { name: "India", minLat: 8.1, minLon: 68.1, maxLat: 35.5, maxLon: 97.4 },
  { name: "China", minLat: 18.2, minLon: 73.6, maxLat: 53.6, maxLon: 134.8 },
  { name: "South Africa", minLat: -34.8, minLon: 16.5, maxLat: -22.1, maxLon: 32.9 },
  { name: "Nigeria", minLat: 4.3, minLon: 2.7, maxLat: 13.9, maxLon: 14.7 },
  { name: "Kenya", minLat: -4.7, minLon: 33.9, maxLat: 5.5, maxLon: 41.9 },
  { name: "Egypt", minLat: 22.0, minLon: 24.7, maxLat: 31.7, maxLon: 36.9 },
  { name: "Argentina", minLat: -55.1, minLon: -73.6, maxLat: -21.8, maxLon: -53.6 },
  { name: "Chile", minLat: -56.0, minLon: -75.6, maxLat: -17.5, maxLon: -66.4 },
  { name: "Colombia", minLat: -4.2, minLon: -79.0, maxLat: 12.5, maxLon: -66.9 },
  { name: "Sweden", minLat: 55.3, minLon: 11.0, maxLat: 69.1, maxLon: 24.2 },
  { name: "Norway", minLat: 58.0, minLon: 4.6, maxLat: 71.2, maxLon: 31.1 },
  { name: "Finland", minLat: 59.8, minLon: 20.6, maxLat: 70.1, maxLon: 31.6 },
  { name: "Poland", minLat: 49.0, minLon: 14.1, maxLat: 54.8, maxLon: 24.1 },
  { name: "Ukraine", minLat: 44.4, minLon: 22.1, maxLat: 52.4, maxLon: 40.2 },
  { name: "Turkey", minLat: 36.0, minLon: 26.0, maxLat: 42.1, maxLon: 44.8 },
  { name: "South Korea", minLat: 33.1, minLon: 125.1, maxLat: 38.6, maxLon: 129.6 },
  { name: "Indonesia", minLat: -11.0, minLon: 95.0, maxLat: 6.1, maxLon: 141.0 },
  { name: "Philippines", minLat: 4.6, minLon: 116.9, maxLat: 21.1, maxLon: 126.6 },
  { name: "Thailand", minLat: 5.6, minLon: 97.3, maxLat: 20.5, maxLon: 105.6 },
  { name: "Vietnam", minLat: 8.4, minLon: 102.1, maxLat: 23.4, maxLon: 109.5 },
  { name: "Pakistan", minLat: 23.7, minLon: 60.9, maxLat: 37.1, maxLon: 77.1 },
  { name: "Bangladesh", minLat: 20.7, minLon: 88.0, maxLat: 26.6, maxLon: 92.7 },
  { name: "Saudi Arabia", minLat: 16.4, minLon: 34.5, maxLat: 32.2, maxLon: 55.7 },
  { name: "United Arab Emirates", minLat: 22.6, minLon: 51.6, maxLat: 26.1, maxLon: 56.4 },
  { name: "Israel", minLat: 29.5, minLon: 34.3, maxLat: 33.3, maxLon: 35.9 },
  { name: "Greece", minLat: 34.8, minLon: 19.4, maxLat: 41.7, maxLon: 28.2 },
  { name: "Portugal", minLat: 36.96, minLon: -9.5, maxLat: 42.2, maxLon: -6.2 },
  { name: "Netherlands", minLat: 50.8, minLon: 3.4, maxLat: 53.5, maxLon: 7.2 },
  { name: "Belgium", minLat: 49.5, minLon: 2.5, maxLat: 51.5, maxLon: 6.4 },
  { name: "Switzerland", minLat: 45.8, minLon: 5.96, maxLat: 47.8, maxLon: 10.5 },
  { name: "Austria", minLat: 46.4, minLon: 9.5, maxLat: 49.0, maxLon: 17.2 },
  { name: "Czechia", minLat: 48.6, minLon: 12.1, maxLat: 51.1, maxLon: 18.9 },
  { name: "Romania", minLat: 43.6, minLon: 20.3, maxLat: 48.3, maxLon: 29.7 },
  { name: "Hungary", minLat: 45.7, minLon: 16.1, maxLat: 48.6, maxLon: 22.9 },
  { name: "Denmark", minLat: 54.6, minLon: 8.1, maxLat: 57.8, maxLon: 15.2 },
  { name: "Iceland", minLat: 63.4, minLon: -24.5, maxLat: 66.5, maxLon: -13.5 },
  { name: "Morocco", minLat: 27.7, minLon: -13.2, maxLat: 35.9, maxLon: -1.0 },
  { name: "Ghana", minLat: 4.7, minLon: -3.3, maxLat: 11.2, maxLon: 1.2 },
  { name: "Ethiopia", minLat: 3.4, minLon: 33.0, maxLat: 14.9, maxLon: 48.0 },
  { name: "Tanzania", minLat: -11.7, minLon: 29.3, maxLat: -1.0, maxLon: 40.4 },
  { name: "Peru", minLat: -18.4, minLon: -81.3, maxLat: -0.04, maxLon: -68.7 },
  { name: "Venezuela", minLat: 0.6, minLon: -73.4, maxLat: 12.2, maxLon: -59.8 },
  { name: "Cuba", minLat: 19.8, minLon: -85.0, maxLat: 23.3, maxLon: -74.1 },
  { name: "Singapore", minLat: 1.2, minLon: 103.6, maxLat: 1.47, maxLon: 104.1 },
  { name: "Malaysia", minLat: 0.9, minLon: 99.6, maxLat: 7.4, maxLon: 119.3 },
  { name: "Taiwan", minLat: 21.9, minLon: 120.0, maxLat: 25.3, maxLon: 122.0 },
];

const CA_PROV: { name: string; minLat: number; minLon: number; maxLat: number; maxLon: number }[] = [
  { name: "Ontario", minLat: 41.7, minLon: -95.2, maxLat: 56.9, maxLon: -74.3 },
  { name: "Quebec", minLat: 45.0, minLon: -79.8, maxLat: 62.6, maxLon: -57.1 },
  { name: "British Columbia", minLat: 48.3, minLon: -139.1, maxLat: 60.0, maxLon: -114.0 },
  { name: "Alberta", minLat: 49.0, minLon: -120.0, maxLat: 60.0, maxLon: -110.0 },
  { name: "Manitoba", minLat: 49.0, minLon: -102.0, maxLat: 60.0, maxLon: -89.0 },
  { name: "Saskatchewan", minLat: 49.0, minLon: -110.0, maxLat: 60.0, maxLon: -101.4 },
  { name: "Nova Scotia", minLat: 43.4, minLon: -66.4, maxLat: 47.0, maxLon: -59.7 },
  { name: "New Brunswick", minLat: 44.6, minLon: -69.1, maxLat: 48.1, maxLon: -63.8 },
  { name: "Newfoundland and Labrador", minLat: 46.6, minLon: -67.8, maxLat: 60.4, maxLon: -52.6 },
  { name: "Prince Edward Island", minLat: 45.9, minLon: -64.4, maxLat: 47.1, maxLon: -61.9 },
  { name: "Yukon", minLat: 60.0, minLon: -141.0, maxLat: 69.6, maxLon: -123.8 },
  { name: "Northwest Territories", minLat: 60.0, minLon: -136.5, maxLat: 78.8, maxLon: -102.0 },
  { name: "Nunavut", minLat: 60.0, minLon: -120.8, maxLat: 83.1, maxLon: -61.2 },
];

function hit(
  lat: number,
  lon: number,
  list: { name: string; minLat: number; minLon: number; maxLat: number; maxLon: number }[],
): { name: string; area: number } | null {
  let best: { name: string; area: number } | null = null;
  for (const r of list) {
    if (lat >= r.minLat && lat <= r.maxLat && lon >= r.minLon && lon <= r.maxLon) {
      const area = (r.maxLat - r.minLat) * (r.maxLon - r.minLon);
      if (!best || area < best.area) best = { name: r.name, area };
    }
  }
  return best;
}

function localRegion(lat: number, lon: number): Region | null {
  const us = hit(lat, lon, US_STATES);
  if (us) return { admin1: us.name, country: "United States" };
  const ca = hit(lat, lon, CA_PROV);
  if (ca) return { admin1: ca.name, country: "Canada" };
  const c = hit(lat, lon, COUNTRIES);
  if (c) return { admin1: "", country: c.name };
  return null;
}

export async function regionFromCoords(lat: number, lon: number): Promise<Region> {
  const local = localRegion(lat, lon);
  if (local?.country) return local;
  throw new Error("Could not read a region from this device. GPS stays off.");
}

export function readDevicePosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device has no location API."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(err.message || "Location permission denied.")),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 },
    );
  });
}
