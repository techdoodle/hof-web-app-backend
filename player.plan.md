# Google Maps URL Integration for Venues - Updated Plan

## Overview

Replace direct latitude/longitude inputs with Google Maps URL fields in both Excel upload and frontend forms. Automatically extract coordinates using the existing `parseGoogleMapsUrl` utility function. Track and display specific venue rows that fail URL parsing while still saving successful venues.

## Backend Changes

### 1. Update Excel Upload Service (`venue-excel-upload.service.ts`)

- **Update `ExcelVenueRow` interface**: 
  - Remove `latitude?: number` and `longitude?: number`
  - Add `googleMapsUrl?: string`

- **Update `validateVenueData` method**: 
  - Remove latitude/longitude validation (lines 98-111)
  - Add validation for Google Maps URL format (optional field)
  - Validate that URL can be parsed if provided (warn but don't fail)

- **Update `processVenueUpload` method**:
  - Import `parseGoogleMapsUrl` from `../../common/utils/google-maps.util`
  - Create `failedVenues` array to track venues with parsing failures: `{ row: number, venueName: string, phoneNumber: string, reason: string }`
  - For each row, check if `googleMapsUrl` is provided
  - Parse the URL to extract coordinates using `parseGoogleMapsUrl`
  - If parsing fails and URL is provided, add to `failedVenues` array with row number, venue name, phone number, and reason
  - Continue processing the venue (save with null coordinates if parsing fails)
  - Return `failedVenues` array in addition to `created`, `updated`, and `errors`

- **Update `generateExcelTemplate` method**:
  - Replace `'latitude'` and `'longitude'` headers with `'googleMapsUrl'` (lines 237-238)
  - Update sample row to include example Google Maps URL instead of coordinates (lines 254-255)
  - Example URL: `https://www.google.com/maps/place/Example+Venue/@19.0760,72.8777,15z`

### 2. Update Admin Controller (`admin.controller.ts`)

- **Update `uploadVenuesExcel` endpoint** (line 283-298):
  - Include `failedVenues` in the response object
  - Response structure: `{ message, created, updated, errors, failedVenues }`

### 3. Verify Admin Service (`admin.service.ts`)

- Ensure `createVenue` and `updateVenue` methods already handle `googleMapsUrl` (verify lines 1088-1096 and 1175-1188)
- The existing code should already handle this correctly

## Frontend Changes

### 4. Update VenueExcelUpload Component (`VenueExcelUpload.tsx`)

- **Update `UploadResult` interface**:
  - Add `failedVenues?: Array<{ row: number; venueName: string; phoneNumber: string; reason: string }>`

- **Update results display section** (lines 213-247):
  - Add a new section to display failed venues clearly
  - Show failed venues in a table or list format with:
    - Row number
    - Venue name
    - Phone number
    - Reason for failure (e.g., "Failed to parse Google Maps URL")
  - Use Material-UI `Table` or `List` component for better readability
  - Style failed venues section with error/warning color scheme
  - Display message: "X venue(s) failed Google Maps URL parsing but were saved without coordinates"

### 5. Update VenueCreate Component (`VenueCreate.tsx`)

- **Remove**: Direct latitude/longitude `TextInput` fields (lines 130-147)
- **Add**: Google Maps URL `TextInput` field
  - Label: "Google Maps URL"
  - Placeholder: "https://www.google.com/maps/place/..."
  - Optional field (no `required()` validation)
- **Add**: Read-only display of extracted coordinates
  - Use `TextInput` with `disabled` prop or `Typography` component
  - Show latitude and longitude as read-only fields
  - Update coordinates when Google Maps URL changes (client-side parsing or API call)
  - Label: "Latitude (auto-extracted)" and "Longitude (auto-extracted)"
- **Update `transform` function**: 
  - Ensure `googleMapsUrl` is passed to backend
  - Remove any latitude/longitude transformation logic

### 6. Update VenueEdit Component (`VenueEdit.tsx`)

- **Remove**: Direct latitude/longitude `TextInput` fields (lines 128-145)
- **Add**: Google Maps URL `TextInput` field
  - Label: "Google Maps URL"
  - Placeholder: "https://www.google.com/maps/place/..."
  - Optional field
  - Pre-populate with existing URL if venue has one (may need backend support)
- **Add**: Display current coordinates as read-only
  - Show existing latitude and longitude as read-only fields
  - Label: "Latitude (read-only)" and "Longitude (read-only)"
  - If venue has lat/lng but no URL, show them as read-only
- **Update `transform` function**: 
  - Ensure `googleMapsUrl` is passed to backend
  - Remove any latitude/longitude transformation logic

### 7. Optional: Create Google Maps URL Input Component

- Create reusable component `GoogleMapsUrlInput.tsx` that:
  - Accepts URL input
  - Parses URL on change (client-side using same utility logic or API call)
  - Shows extracted coordinates as read-only preview
  - Handles validation and error states
  - Use this component in both VenueCreate and VenueEdit

## Implementation Details

### Excel Template Format

- Column name: `googleMapsUrl`
- Example value: `https://www.google.com/maps/place/Example+Venue/@19.0760,72.8777,15z`
- Supports all formats handled by `parseGoogleMapsUrl` utility

### Error Handling

- Excel upload: If URL parsing fails, add to `failedVenues` array and continue (coordinates will be null)
- Frontend: Show validation error if URL format is invalid (optional client-side validation)
- Backend: Return clear error messages in `failedVenues` array with specific row numbers and venue details

### Failed Venues Response Structure

```typescript
{
  created: number;
  updated: number;
  errors: string[];
  failedVenues: Array<{
    row: number;           // Excel row number (1-indexed, accounting for header)
    venueName: string;     // Venue name from Excel
    phoneNumber: string;   // Phone number from Excel
    reason: string;        // Error reason, e.g., "Failed to parse Google Maps URL"
  }>;
}
```

### Backward Compatibility

- Existing venues with lat/lng but no URL will continue to work
- Excel upload will update venues, preserving existing coordinates if URL parsing fails
- Frontend forms will show existing coordinates as read-only even if no URL is provided

## Files to Modify

1. `hof-web-app-backend/src/modules/admin/services/venue-excel-upload.service.ts`
2. `hof-web-app-backend/src/modules/admin/admin.controller.ts`
3. `hof-admin/src/resources/venues/VenueExcelUpload.tsx`
4. `hof-admin/src/resources/venues/VenueCreate.tsx`
5. `hof-admin/src/resources/venues/VenueEdit.tsx`
6. (Optional) `hof-admin/src/components/GoogleMapsUrlInput.tsx` - new component

## Testing Considerations

- Test with various Google Maps URL formats
- Test with invalid URLs (should add to failedVenues but still save venue)
- Test Excel upload with mixed valid/invalid URLs
- Verify coordinates are correctly extracted and saved for valid URLs
- Verify failed venues are clearly displayed in the frontend
- Verify existing venues continue to work after update
- Test with empty googleMapsUrl (should not fail, just skip coordinate extraction)
