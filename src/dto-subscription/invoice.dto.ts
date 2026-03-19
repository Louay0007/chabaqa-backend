import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsDateString, IsEnum, IsOptional, IsArray } from 'class-validator';

export enum InvoiceStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  PAID = 'paid',
  VOID = 'void',
  UNCOLLECTIBLE = 'uncollectible'
}

export class InvoiceLineItemDto {
  @ApiProperty({ 
    description: 'Line item ID',
    example: 'li_1234567890'
  })
  @IsString()
  id: string;

  @ApiProperty({ 
    description: 'Item description',
    example: 'Chabaqa Pro Plan - January 2024'
  })
  @IsString()
  description: string;

  @ApiProperty({ 
    description: 'Amount in cents',
    example: 2999
  })
  @IsNumber()
  amount: number;

  @ApiProperty({ 
    description: 'Currency',
    example: 'TND'
  })
  @IsString()
  currency: string;

  @ApiProperty({ 
    description: 'Quantity',
    example: 1
  })
  @IsNumber()
  quantity: number;
}

export class InvoiceDto {
  @ApiProperty({ 
    description: 'Invoice ID',
    example: 'in_1234567890'
  })
  @IsString()
  id: string;

  @ApiProperty({ 
    description: 'Customer ID',
    example: '507f1f77bcf86cd799439012'
  })
  @IsString()
  customerId: string;

  @ApiProperty({ 
    description: 'Subscription ID',
    example: 'sub_1234567890'
  })
  @IsString()
  subscriptionId: string;

  @ApiProperty({ 
    description: 'Invoice status',
    enum: InvoiceStatus
  })
  @IsEnum(InvoiceStatus)
  status: string;

  @ApiProperty({ 
    description: 'Invoice number',
    example: 'INV-2024-001'
  })
  @IsString()
  invoiceNumber: string;

  @ApiProperty({ 
    description: 'Total amount in cents',
    example: 2999
  })
  @IsNumber()
  total: number;

  @ApiProperty({ 
    description: 'Subtotal amount in cents',
    example: 2999
  })
  @IsNumber()
  subtotal: number;

  @ApiPropertyOptional({ 
    description: 'Tax amount in cents',
    example: 0
  })
  @IsOptional()
  @IsNumber()
  tax?: number;

  @ApiProperty({ 
    description: 'Currency',
    example: 'TND'
  })
  @IsString()
  currency: string;

  @ApiProperty({ 
    description: 'Invoice date',
    example: '2024-01-15T00:00:00.000Z'
  })
  @IsDateString()
  invoiceDate: string;

  @ApiPropertyOptional({ 
    description: 'Due date',
    example: '2024-02-15T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ 
    description: 'Paid date',
    example: '2024-01-15T10:30:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiProperty({ 
    description: 'Line items',
    type: [InvoiceLineItemDto]
  })
  @IsArray()
  lineItems: InvoiceLineItemDto[];

  @ApiPropertyOptional({ 
    description: 'Invoice PDF URL',
    example: 'https://invoices.example.com/in_1234567890.pdf'
  })
  @IsOptional()
  @IsString()
  invoicePdfUrl?: string;

  @ApiProperty({ 
    description: 'Created timestamp',
    example: '2024-01-15T10:30:00.000Z'
  })
  @IsDateString()
  createdAt: string;

  @ApiProperty({ 
    description: 'Updated timestamp',
    example: '2024-01-15T10:30:00.000Z'
  })
  @IsDateString()
  updatedAt: string;
}

export class InvoiceListDto {
  @ApiProperty({ 
    description: 'List of invoices',
    type: [InvoiceDto]
  })
  @IsArray()
  invoices: InvoiceDto[];

  @ApiProperty({ 
    description: 'Total count',
    example: 25
  })
  @IsNumber()
  total: number;

  @ApiProperty({ 
    description: 'Current page',
    example: 1
  })
  @IsNumber()
  page: number;

  @ApiProperty({ 
    description: 'Items per page',
    example: 20
  })
  @IsNumber()
  limit: number;
}

export class CreateInvoiceDto {
  @ApiProperty({ 
    description: 'Customer ID',
    example: '507f1f77bcf86cd799439012'
  })
  @IsString()
  customerId: string;

  @ApiProperty({ 
    description: 'Subscription ID',
    example: 'sub_1234567890'
  })
  @IsString()
  subscriptionId: string;

  @ApiProperty({ 
    description: 'Line items',
    type: [InvoiceLineItemDto]
  })
  @IsArray()
  lineItems: InvoiceLineItemDto[];

  @ApiPropertyOptional({ 
    description: 'Due date',
    example: '2024-02-15T00:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ 
    description: 'Invoice description',
    example: 'Monthly subscription invoice'
  })
  @IsOptional()
  @IsString()
  description?: string;
}