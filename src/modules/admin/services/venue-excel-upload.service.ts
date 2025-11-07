import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { Venue } from '../../venue/venue.entity';
import { VenueFormatEntity } from '../../venue/venue-formats.entity';
import { VenueFormat } from '../../venue/venue-format.enum';
import { City } from '../../cities/cities.entity';

interface ExcelVenueRow {
  name: string;
  phoneNumber: string;
  address?: string;
  cityName: string;
  stateName: string;
  latitude?: number;
  longitude?: number;
  '5v5_Cost'?: number;
  '6v6_Cost'?: number;
  '7v7_Cost'?: number;
  '8v8_Cost'?: number;
  '9v9_Cost'?: number;
  '10v10_Cost'?: number;
  '11v11_Cost'?: number;
}

@Injectable()
export class VenueExcelUploadService {
  private readonly logger = new Logger(VenueExcelUploadService.name);

  constructor(
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,
    @InjectRepository(VenueFormatEntity)
    private readonly venueFormatRepository: Repository<VenueFormatEntity>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    private readonly dataSource: DataSource,
  ) {}

  async parseExcelFile(file: Express.Multer.File): Promise<ExcelVenueRow[]> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const validExtensions = ['.xlsx', '.xls'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExtension)) {
      throw new BadRequestException('File must be an Excel file (.xlsx or .xls)');
    }

    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<ExcelVenueRow>(worksheet);

      return data;
    } catch (error) {
      this.logger.error('Error parsing Excel file', error);
      throw new BadRequestException('Failed to parse Excel file: ' + error.message);
    }
  }

  validateVenueData(data: ExcelVenueRow[]): void {
    if (!data || data.length === 0) {
      throw new BadRequestException('Excel file is empty or contains no data');
    }

    const requiredColumns = ['name', 'phoneNumber', 'cityName', 'stateName'];
    const formatColumns = ['5v5_Cost', '6v6_Cost', '7v7_Cost', '8v8_Cost', '9v9_Cost', '10v10_Cost', '11v11_Cost'];

    data.forEach((row, index) => {
      // Check required fields
      for (const col of requiredColumns) {
        if (!row[col] || String(row[col]).trim() === '') {
          throw new BadRequestException(`Row ${index + 2}: Missing required field "${col}"`);
        }
      }

      // Validate phone number format (basic check)
      const phoneNumber = String(row.phoneNumber).trim();
      if (phoneNumber.length < 10) {
        throw new BadRequestException(`Row ${index + 2}: Invalid phone number`);
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

      // Validate coordinates if provided
      if (row.latitude !== undefined && row.latitude !== null && String(row.latitude).trim() !== '') {
        const lat = Number(row.latitude);
        if (isNaN(lat) || lat < -90 || lat > 90) {
          throw new BadRequestException(`Row ${index + 2}: Invalid latitude value`);
        }
      }

      if (row.longitude !== undefined && row.longitude !== null && String(row.longitude).trim() !== '') {
        const lon = Number(row.longitude);
        if (isNaN(lon) || lon < -180 || lon > 180) {
          throw new BadRequestException(`Row ${index + 2}: Invalid longitude value`);
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

  async processVenueUpload(data: ExcelVenueRow[]): Promise<{ created: number; updated: number; errors: string[] }> {
    this.validateVenueData(data);

    const errors: string[] = [];
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

          // Find existing venue by phone number (unique identifier)
          const phoneNumber = String(row.phoneNumber).trim();
          let venue = await manager.findOne(Venue, {
            where: { phoneNumber },
            relations: ['venueFormats'],
          });

          if (venue) {
            // UPDATE existing venue (preserves ID, maintains foreign key references)
            venue.name = String(row.name).trim();
            if (row.address) venue.address = String(row.address).trim();
            venue.city = city;
            if (row.latitude !== undefined && row.latitude !== null && String(row.latitude).trim() !== '') {
              venue.latitude = Number(row.latitude);
            }
            if (row.longitude !== undefined && row.longitude !== null && String(row.longitude).trim() !== '') {
              venue.longitude = Number(row.longitude);
            }
            
            await manager.save(Venue, venue);
            
            // Delete existing formats and recreate (to handle updates/removals)
            await manager.delete(VenueFormatEntity, { venue: { id: venue.id } });
            updated++;
          } else {
            // CREATE new venue
            venue = new Venue();
            venue.name = String(row.name).trim();
            venue.phoneNumber = phoneNumber;
            if (row.address) venue.address = String(row.address).trim();
            venue.city = city;
            if (row.latitude !== undefined && row.latitude !== null && String(row.latitude).trim() !== '') {
              venue.latitude = Number(row.latitude);
            }
            if (row.longitude !== undefined && row.longitude !== null && String(row.longitude).trim() !== '') {
              venue.longitude = Number(row.longitude);
            }
            
            venue = await manager.save(Venue, venue);
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

    return { created, updated, errors };
  }

  generateExcelTemplate(): Buffer {
    try {
      const headers = [
        'name',
        'phoneNumber',
        'address',
        'cityName',
        'stateName',
        'latitude',
        'longitude',
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
        '19.0760',
        '72.8777',
        '5000',
        '6000',
        '7000',
        '',
        '',
        '',
        '',
      ];

      const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Venues');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      if (!buffer || buffer.length === 0) {
        this.logger.error('Generated Excel buffer is empty');
        throw new Error('Failed to generate Excel template: empty buffer');
      }
      
      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error('Error in generateExcelTemplate:', error);
      throw error;
    }
  }
}

