import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateBankCredentialsDto {
  @ApiProperty({
    description: 'Tunisian RIB (20 digits)',
    example: '12345678901234567890',
  })
  @IsString()
  rib: string;

  @ApiProperty({
    description: 'Bank name',
    example: 'Attijari Bank',
  })
  @IsString()
  bankName: string;

  @ApiProperty({
    description: 'Account holder name',
    example: 'Mohamed Trabelsi',
  })
  @IsString()
  ownerName: string;
}

