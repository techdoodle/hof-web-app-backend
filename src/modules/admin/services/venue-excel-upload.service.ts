import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import { Venue } from '../../venue/venue.entity';
import { VenueFormatEntity } from '../../venue/venue-formats.entity';
import { VenueFormat } from '../../venue/venue-format.enum';
import { City } from '../../cities/cities.entity';
import { parseGoogleMapsUrl } from '../../../common/utils/google-maps.util';

interface CsvVenueRow {
  name: string;
  phoneNumber: string;
  address?: string;
  cityName: string;
  stateName: string;
  googleMapsUrl?: string;
  '5v5_Cost'?: number;
  '6v6_Cost'?: number;
  '7v7_Cost'?: number;
  '8v8_Cost'?: number;
  '9v9_Cost'?: number;
  '10v10_Cost'?: number;
  '11v11_Cost'?: number;
}

@Injectable()
export class VenueCsvUploadService {
  private readonly logger = new Logger(VenueCsvUploadService.name);

  constructor(
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,
    @InjectRepository(VenueFormatEntity)
    private readonly venueFormatRepository: Repository<VenueFormatEntity>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    private readonly dataSource: DataSource,
  ) {}

  async parseCsvFile(file: Express.Multer.File): Promise<CsvVenueRow[]> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV file (.csv)');
    }

    try {
      return await this.parseCsv(file.buffer);
    } catch (error) {
      this.logger.error('Error parsing CSV file', error);
      throw new BadRequestException('Failed to parse CSV file: ' + error.message);
    }
  }

  private async parseCsv(buffer: Buffer): Promise<CsvVenueRow[]> {
    return new Promise((resolve, reject) => {
      const results: CsvVenueRow[] = [];
      const stream = Readable.from(buffer.toString());

      stream
        .pipe(csv({
          mapHeaders: ({ header }) => header.trim(),
        }))
        .on('data', (data) => {
          // Convert empty strings to null for optional fields
          const cleanedData = Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
              key,
              value === '' || value === undefined ? null : value
            ])
          ) as Record<string, any>;

          // Skip empty rows (rows where all required fields are null/empty)
          const hasRequiredData = cleanedData.name || cleanedData.cityName || cleanedData.stateName;
          if (hasRequiredData) {
            results.push(cleanedData as unknown as CsvVenueRow);
          }
        })
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  }

  validateVenueData(data: CsvVenueRow[]): void {
    if (!data || data.length === 0) {
      throw new BadRequestException('CSV file is empty or contains no data');
    }

    const requiredColumns = ['name', 'cityName', 'stateName'];
    const formatColumns = ['5v5_Cost', '6v6_Cost', '7v7_Cost', '8v8_Cost', '9v9_Cost', '10v10_Cost', '11v11_Cost'];

    data.forEach((row, index) => {
      // Check required fields
      for (const col of requiredColumns) {
        if (!row[col] || String(row[col]).trim() === '') {
          throw new BadRequestException(`Row ${index + 2}: Missing required field "${col}"`);
        }
      }

      // Validate phone number format if provided (optional field)
      if (row.phoneNumber !== undefined && row.phoneNumber !== null && String(row.phoneNumber).trim() !== '') {
        const phoneNumber = String(row.phoneNumber).trim();
        if (phoneNumber.length < 10) {
          throw new BadRequestException(`Row ${index + 2}: Invalid phone number (must be at least 10 digits if provided)`);
        }
      }

      // Validate format costs if provided
      for (const col of formatColumns) {
        if (row[col] !== undefined && row[col] !== null && row[col] !== '') {
          const cost = Number(row[col]);
          if (isNaN(cost) || cost < 0) {
            throw new BadRequestException(`Row ${index + 2}: Invalid cost value for "${col}"`);
          }
        }
      }

      // Validate Google Maps URL if provided (optional field)
      if (row.googleMapsUrl !== undefined && row.googleMapsUrl !== null && String(row.googleMapsUrl).trim() !== '') {
        const url = String(row.googleMapsUrl).trim();
        // Basic URL format check - actual parsing will happen in processVenueUpload
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.match(/^-?\d+\.?\d*,-?\d+\.?\d*$/)) {
          // Warn but don't fail - parsing will handle it
          this.logger.warn(`Row ${index + 2}: Google Maps URL format may be invalid: ${url}`);
        }
      }
    });
  }

  private mapFormatColumnToEnum(column: string): VenueFormat | null {
    const mapping: Record<string, VenueFormat> = {
      '5v5_Cost': VenueFormat.FIVE_VS_FIVE,
      '6v6_Cost': VenueFormat.SIX_VS_SIX,
      '7v7_Cost': VenueFormat.SEVEN_VS_SEVEN,
      '8v8_Cost': VenueFormat.EIGHT_VS_EIGHT,
      '9v9_Cost': VenueFormat.NINE_VS_NINE,
      '10v10_Cost': VenueFormat.TEN_VS_TEN,
      '11v11_Cost': VenueFormat.ELEVEN_VS_ELEVEN,
    };
    return mapping[column] || null;
  }

  async processVenueUpload(data: CsvVenueRow[]): Promise<{ created: number; updated: number; errors: string[]; failedVenues: Array<{ row: number; venueName: string; phoneNumber: string; reason: string }> }> {
    this.validateVenueData(data);

    const errors: string[] = [];
    const failedVenues: Array<{ row: number; venueName: string; phoneNumber: string; reason: string }> = [];
    let created = 0;
    let updated = 0;

    // Use transaction to upsert venues (preserve IDs to maintain foreign key references)
    await this.dataSource.transaction(async (manager) => {
      // Process each row - upsert instead of delete-all
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        try {
          // Find city
          let city = await manager.findOne(City, {
            where: {
              cityName: String(row.cityName).trim(),
              stateName: String(row.stateName).trim(),
            },
          });

          if (!city) {
            errors.push(`Row ${i + 2}: City "${row.cityName}, ${row.stateName}" not found. Please create the city first.`);
            continue;
          }

          // Find existing venue by name (unique identifier)
          const venueName = String(row.name).trim();
          const phoneNumber = row.phoneNumber ? String(row.phoneNumber).trim() : null;
          let venue = await manager.findOne(Venue, {
            where: { name: venueName },
            relations: ['venueFormats'],
          });

          // Parse Google Maps URL if provided
          let latitude: number | null = null;
          let longitude: number | null = null;
          
          if (row.googleMapsUrl !== undefined && row.googleMapsUrl !== null && String(row.googleMapsUrl).trim() !== '') {
            const googleMapsUrl = String(row.googleMapsUrl).trim();
            this.logger.log(`[processVenueUpload] Row ${i + 2} - Parsing Google Maps URL for venue "${venueName}": ${googleMapsUrl}`);
            
            try {
              const coords = await parseGoogleMapsUrl(googleMapsUrl);
              this.logger.log(`[processVenueUpload] Row ${i + 2} - Google Maps URL parser returned: ${JSON.stringify(coords)}`);
              
              if (coords) {
                latitude = coords.latitude;
                longitude = coords.longitude;
                this.logger.log(`[processVenueUpload] Row ${i + 2} - Successfully parsed coordinates for "${venueName}": latitude=${latitude}, longitude=${longitude}`);
              } else {
                this.logger.warn(`[processVenueUpload] Row ${i + 2} - Failed to parse Google Maps URL for "${venueName}": ${googleMapsUrl}. Parser returned: ${coords}`);
                // URL parsing failed - add to failedVenues but continue processing
                failedVenues.push({
                  row: i + 2, // CSV row number (1-indexed, accounting for header)
                  venueName: venueName,
                  phoneNumber: phoneNumber || 'N/A',
                  reason: 'Failed to parse Google Maps URL'
                });
              }
            } catch (error) {
              this.logger.error(`[processVenueUpload] Row ${i + 2} - Error parsing Google Maps URL for "${venueName}": ${googleMapsUrl}`, error);
              this.logger.error(`[processVenueUpload] Row ${i + 2} - Error details: ${error instanceof Error ? error.message : String(error)}`);
              failedVenues.push({
                row: i + 2,
                venueName: venueName,
                phoneNumber: phoneNumber || 'N/A',
                reason: `Error parsing Google Maps URL: ${error instanceof Error ? error.message : String(error)}`
              });
            }
          } else {
            this.logger.log(`[processVenueUpload] Row ${i + 2} - No Google Maps URL provided for venue "${venueName}"`);
          }

          if (venue) {
            // UPDATE existing venue (preserves ID, maintains foreign key references)
            this.logger.log(`[processVenueUpload] Row ${i + 2} - Updating existing venue "${venueName}" (ID: ${venue.id})`);
            venue.name = venueName;
            if (phoneNumber) venue.phoneNumber = phoneNumber;
            if (row.address) venue.address = String(row.address).trim();
            venue.city = city;
            if (latitude !== null && longitude !== null) {
              venue.latitude = latitude;
              venue.longitude = longitude;
              this.logger.log(`[processVenueUpload] Row ${i + 2} - Setting coordinates for "${venueName}": ${latitude}, ${longitude}`);
            } else {
              this.logger.warn(`[processVenueUpload] Row ${i + 2} - No coordinates to set for "${venueName}" (latitude: ${latitude}, longitude: ${longitude})`);
            }
            
            await manager.save(Venue, venue);
            // Reload venue to get all fields including relations
            const savedVenue = await manager.findOne(Venue, { 
              where: { id: venue.id },
              relations: ['city']
            });
            this.logger.log(`[processVenueUpload] Row ${i + 2} - Saved venue details: ${JSON.stringify({
              id: savedVenue?.id,
              name: savedVenue?.name,
              phoneNumber: savedVenue?.phoneNumber,
              address: savedVenue?.address,
              city: savedVenue?.city ? `${savedVenue.city.cityName}, ${savedVenue.city.stateName}` : null,
              latitude: savedVenue?.latitude,
              longitude: savedVenue?.longitude,
            }, null, 2)}`);
            
            // Delete existing formats and recreate (to handle updates/removals)
            await manager.delete(VenueFormatEntity, { venue: { id: venue.id } });
            updated++;
          } else {
            // CREATE new venue
            this.logger.log(`[processVenueUpload] Row ${i + 2} - Creating new venue "${venueName}"`);
            venue = new Venue();
            venue.name = venueName;
            if (phoneNumber) venue.phoneNumber = phoneNumber;
            if (row.address) venue.address = String(row.address).trim();
            venue.city = city;
            if (latitude !== null && longitude !== null) {
              venue.latitude = latitude;
              venue.longitude = longitude;
              this.logger.log(`[processVenueUpload] Row ${i + 2} - Setting coordinates for new venue "${venueName}": ${latitude}, ${longitude}`);
            } else {
              this.logger.warn(`[processVenueUpload] Row ${i + 2} - No coordinates to set for new venue "${venueName}" (latitude: ${latitude}, longitude: ${longitude})`);
            }
            
            venue = await manager.save(Venue, venue);
            // Reload venue to get all fields including relations
            const savedVenue = await manager.findOne(Venue, { 
              where: { id: venue.id },
              relations: ['city']
            });
            this.logger.log(`[processVenueUpload] Row ${i + 2} - Created venue details: ${JSON.stringify({
              id: savedVenue?.id,
              name: savedVenue?.name,
              phoneNumber: savedVenue?.phoneNumber,
              address: savedVenue?.address,
              city: savedVenue?.city ? `${savedVenue.city.cityName}, ${savedVenue.city.stateName}` : null,
              latitude: savedVenue?.latitude,
              longitude: savedVenue?.longitude,
            }, null, 2)}`);
            created++;
          }

          // Create venue formats (same for both create and update)
          const formatColumns = ['5v5_Cost', '6v6_Cost', '7v7_Cost', '8v8_Cost', '9v9_Cost', '10v10_Cost', '11v11_Cost'];
          const formatEntities: VenueFormatEntity[] = [];

          for (const col of formatColumns) {
            if (row[col] !== undefined && row[col] !== null && row[col] !== '') {
              const format = this.mapFormatColumnToEnum(col);
              if (format) {
                const cost = Number(row[col]);
                const formatEntity = new VenueFormatEntity();
                formatEntity.venue = venue;
                formatEntity.format = format;
                formatEntity.cost = cost;
                formatEntities.push(formatEntity);
              }
            }
          }

          if (formatEntities.length > 0) {
            await manager.save(VenueFormatEntity, formatEntities);
          }

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Row ${i + 2}: ${errorMsg}`);
          this.logger.error(`Error processing row ${i + 2}`, error);
        }
      }
    });

    return { created, updated, errors, failedVenues };
  }

  generateCsvTemplate(): Buffer {
    try {
      const headers = [
        'name',
        'phoneNumber',
        'address',
        'cityName',
        'stateName',
        'googleMapsUrl',
        '5v5_Cost',
        '6v6_Cost',
        '7v7_Cost',
        '8v8_Cost',
        '9v9_Cost',
        '10v10_Cost',
        '11v11_Cost',
      ];

      const sampleRow = [
        'Example Venue',
        '1234567890',
        '123 Main Street',
        'Mumbai',
        'Maharashtra',
        'https://www.google.com/maps/place/Example+Venue/@19.0760,72.8777,15z',
        '5000',
        '6000',
        '7000',
        '',
        '',
        '',
        '',
      ];

      // Create CSV content
      const csvContent = [
        headers.join(','),
        sampleRow.map(cell => {
          // Escape commas and quotes in CSV cells
          if (cell === null || cell === undefined) return '';
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      if (!buffer || buffer.length === 0) {
        this.logger.error('Generated CSV buffer is empty');
        throw new Error('Failed to generate CSV template: empty buffer');
      }
      
      return buffer;
    } catch (error) {
      this.logger.error('Error in generateCsvTemplate:', error);
      throw error;
    }
  }
}

