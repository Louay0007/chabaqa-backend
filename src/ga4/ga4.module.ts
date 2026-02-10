import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Ga4Service } from './ga4.service';
import { Ga4ReportingService } from './ga4-reporting.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [Ga4Service, Ga4ReportingService],
  exports: [Ga4Service, Ga4ReportingService],
})
export class Ga4Module {}

