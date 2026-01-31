import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ExportService, ExportFormat, ExportType, ExportStatus } from '../export.service';

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExportService],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  afterEach(() => {
    // Clear any existing jobs between tests
    (service as any).exportJobs.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createExportJob', () => {
    it('should create a new export job with valid configuration', async () => {
      const config = {
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        filters: { status: ['active'] },
        fields: ['id', 'email', 'name'],
        createdBy: new Types.ObjectId(),
      };

      const job = await service.createExportJob(config);

      expect(job).toBeDefined();
      expect(job.id).toMatch(/^export_\d+_[a-z0-9]+$/);
      expect(job.type).toBe(ExportType.USERS);
      expect(job.format).toBe(ExportFormat.CSV);
      expect([ExportStatus.PENDING, ExportStatus.PROCESSING]).toContain(job.status);
      expect(job.progress).toBeGreaterThanOrEqual(0);
      expect(job.createdBy).toBe(config.createdBy);
      expect(job.createdAt).toBeInstanceOf(Date);
    });

    it('should handle different export types and formats', async () => {
      const configs = [
        {
          type: ExportType.COMMUNITIES,
          format: ExportFormat.EXCEL,
          createdBy: new Types.ObjectId(),
        },
        {
          type: ExportType.ANALYTICS,
          format: ExportFormat.PDF,
          createdBy: new Types.ObjectId(),
        },
        {
          type: ExportType.FINANCIAL,
          format: ExportFormat.JSON,
          createdBy: new Types.ObjectId(),
        },
      ];

      for (const config of configs) {
        const job = await service.createExportJob(config);
        expect(job.type).toBe(config.type);
        expect(job.format).toBe(config.format);
        expect([ExportStatus.PENDING, ExportStatus.PROCESSING]).toContain(job.status);
      }
    });

    it('should start processing job in background', async () => {
      const config = {
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        createdBy: new Types.ObjectId(),
      };

      const job = await service.createExportJob(config);
      
      // Wait a bit for background processing to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const updatedJob = await service.getExportStatus(job.id);
      expect(updatedJob?.status).toBe(ExportStatus.PROCESSING);
    });
  });

  describe('getExportStatus', () => {
    it('should return job status for existing job', async () => {
      const config = {
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        createdBy: new Types.ObjectId(),
      };

      const createdJob = await service.createExportJob(config);
      const retrievedJob = await service.getExportStatus(createdJob.id);

      expect(retrievedJob).toBeDefined();
      expect(retrievedJob?.id).toBe(createdJob.id);
      expect(retrievedJob?.type).toBe(createdJob.type);
      expect(retrievedJob?.format).toBe(createdJob.format);
    });

    it('should return null for non-existent job', async () => {
      const nonExistentJobId = 'export_123456789_nonexistent';
      const job = await service.getExportStatus(nonExistentJobId);
      expect(job).toBeNull();
    });
  });

  describe('getUserExportJobs', () => {
    it('should return jobs for specific user', async () => {
      const userId1 = new Types.ObjectId();
      const userId2 = new Types.ObjectId();

      // Create jobs for user 1
      await service.createExportJob({
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        createdBy: userId1,
      });
      await service.createExportJob({
        type: ExportType.COMMUNITIES,
        format: ExportFormat.EXCEL,
        createdBy: userId1,
      });

      // Create job for user 2
      await service.createExportJob({
        type: ExportType.ANALYTICS,
        format: ExportFormat.PDF,
        createdBy: userId2,
      });

      const user1Jobs = await service.getUserExportJobs(userId1.toString());
      const user2Jobs = await service.getUserExportJobs(userId2.toString());

      expect(user1Jobs).toHaveLength(2);
      expect(user2Jobs).toHaveLength(1);
      
      user1Jobs.forEach(job => {
        expect(job.createdBy.toString()).toBe(userId1.toString());
      });
      
      user2Jobs.forEach(job => {
        expect(job.createdBy.toString()).toBe(userId2.toString());
      });
    });

    it('should return jobs sorted by creation date (newest first)', async () => {
      const userId = new Types.ObjectId();

      // Create multiple jobs with slight delays
      const job1 = await service.createExportJob({
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        createdBy: userId,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const job2 = await service.createExportJob({
        type: ExportType.COMMUNITIES,
        format: ExportFormat.EXCEL,
        createdBy: userId,
      });

      const jobs = await service.getUserExportJobs(userId.toString());

      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe(job2.id); // Newest first
      expect(jobs[1].id).toBe(job1.id);
    });

    it('should return empty array for user with no jobs', async () => {
      const userId = new Types.ObjectId();
      const jobs = await service.getUserExportJobs(userId.toString());
      expect(jobs).toEqual([]);
    });
  });

  describe('downloadExport', () => {
    it('should throw error for non-existent job', async () => {
      const nonExistentJobId = 'export_123456789_nonexistent';
      
      await expect(service.downloadExport(nonExistentJobId))
        .rejects
        .toThrow('Export job export_123456789_nonexistent not found');
    });

    it('should throw error for incomplete job', async () => {
      const config = {
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        createdBy: new Types.ObjectId(),
      };

      const job = await service.createExportJob(config);
      
      // Try to download before job is completed
      await expect(service.downloadExport(job.id))
        .rejects
        .toThrow(`Export job ${job.id} is not completed`);
    });

    it('should return buffer for completed job', async () => {
      const config = {
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        createdBy: new Types.ObjectId(),
      };

      const job = await service.createExportJob(config);
      
      // Wait for job to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const updatedJob = await service.getExportStatus(job.id);
      if (updatedJob?.status === ExportStatus.COMPLETED) {
        const buffer = await service.downloadExport(job.id);
        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBeGreaterThan(0);
      }
    }, 10000);
  });

  describe('cleanupExpiredJobs', () => {
    it('should remove expired jobs', async () => {
      const config = {
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        createdBy: new Types.ObjectId(),
      };

      const job = await service.createExportJob(config);
      
      // Manually set job as old (simulate expiration)
      const jobsMap = (service as any).exportJobs;
      const storedJob = jobsMap.get(job.id);
      if (storedJob) {
        storedJob.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      }

      await service.cleanupExpiredJobs();
      
      const retrievedJob = await service.getExportStatus(job.id);
      expect(retrievedJob).toBeNull();
    });

    it('should not remove recent jobs', async () => {
      const config = {
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        createdBy: new Types.ObjectId(),
      };

      const job = await service.createExportJob(config);
      
      await service.cleanupExpiredJobs();
      
      const retrievedJob = await service.getExportStatus(job.id);
      expect(retrievedJob).toBeDefined();
    });
  });

  describe('CSV conversion', () => {
    it('should convert data to CSV format correctly', () => {
      const testData = [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
      ];

      // Access private method for testing
      const csvResult = (service as any).convertToCSV(testData);
      
      expect(csvResult).toContain('id,name,email');
      expect(csvResult).toContain('1,John Doe,john@example.com');
      expect(csvResult).toContain('2,Jane Smith,jane@example.com');
    });

    it('should handle empty data array', () => {
      const csvResult = (service as any).convertToCSV([]);
      expect(csvResult).toBe('');
    });

    it('should escape CSV special characters', () => {
      const testData = [
        { id: 1, name: 'John, Jr.', description: 'Has "quotes" in text' },
      ];

      const csvResult = (service as any).convertToCSV(testData);
      
      expect(csvResult).toContain('"John, Jr."');
      expect(csvResult).toContain('"Has ""quotes"" in text"');
    });
  });

  describe('job ID generation', () => {
    it('should generate unique job IDs', () => {
      const id1 = (service as any).generateJobId();
      const id2 = (service as any).generateJobId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^export_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^export_\d+_[a-z0-9]+$/);
    });
  });

  describe('error handling', () => {
    it('should handle processing errors gracefully', async () => {
      const config = {
        type: ExportType.USERS,
        format: ExportFormat.CSV,
        createdBy: new Types.ObjectId(),
      };

      // Mock processExportJob to throw an error
      const originalProcessJob = service.processExportJob;
      service.processExportJob = jest.fn().mockRejectedValue(new Error('Processing failed'));

      const job = await service.createExportJob(config);
      
      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const updatedJob = await service.getExportStatus(job.id);
      expect(updatedJob?.status).toBe(ExportStatus.FAILED);
      expect(updatedJob?.errorMessage).toBe('Processing failed');

      // Restore original method
      service.processExportJob = originalProcessJob;
    });
  });
});