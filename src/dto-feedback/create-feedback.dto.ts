
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateFeedbackDto {
  @ApiProperty({ description: 'The ID of the item to give feedback to' })
  @IsNotEmpty()
  @IsMongoId()
  relatedTo: string;

  @ApiProperty({ description: 'The model of the item to give feedback to', enum: ['Community', 'Cours', 'Challenge', 'Event', 'Product', 'Session'] })
  @IsNotEmpty()
  @IsIn(['Community', 'Cours', 'Challenge', 'Event', 'Product', 'Session'])
  relatedModel: string;

  @ApiProperty({ description: 'The rating (1-5)' })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ description: 'An optional comment', required: false })
  @IsOptional()
  @IsString()
  comment?: string;
}
