
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateUserNoteDto {
  @ApiProperty({ description: 'ID of the chapter', example: 'chapter_123' })
  @IsString()
  @IsNotEmpty()
  chapterId: string;

  @ApiProperty({ description: 'Content of the note', example: 'This is a note.' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Timestamp in the video (seconds)', example: 120 })
  @IsOptional()
  @IsNumber()
  timestamp?: number;
}

export class UpdateUserNoteDto {
  @ApiProperty({ description: 'Content of the note', example: 'Updated note content.' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Timestamp in the video (seconds)', example: 120 })
  @IsOptional()
  @IsNumber()
  timestamp?: number;
}

export class UserNoteResponseDto {
  @ApiProperty({ description: 'ID of the note' })
  id: string;

  @ApiProperty({ description: 'ID of the chapter' })
  chapterId: string;

  @ApiProperty({ description: 'Content of the note' })
  content: string;

  @ApiPropertyOptional({ description: 'Timestamp in the video' })
  timestamp?: number;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}
