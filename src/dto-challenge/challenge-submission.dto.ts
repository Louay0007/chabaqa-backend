import { IsString, IsNotEmpty, IsOptional, IsArray, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubmissionDto {
  @ApiProperty({ description: 'ID du défi' })
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @ApiProperty({ description: 'ID de la tâche' })
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({ description: 'Contenu ou description de la soumission' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Liens (GitHub, Live demo, etc.)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  links?: string[];

  @ApiPropertyOptional({ description: 'URLs des fichiers téléchargés', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  files?: string[];
}

export class ReviewSubmissionDto {
  @ApiProperty({ enum: ['approved', 'rejected', 'feedback_required'] })
  @IsString()
  @IsNotEmpty()
  status: 'approved' | 'rejected' | 'feedback_required';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional()
  @IsOptional()
  pointsAwarded?: number;
}
