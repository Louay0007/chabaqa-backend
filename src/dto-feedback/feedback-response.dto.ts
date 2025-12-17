
import { ApiProperty } from '@nestjs/swagger';

export class FeedbackResponseDto {
  @ApiProperty({ description: 'The ID of the feedback' })
  _id: string;

  @ApiProperty({ description: 'The ID of the related item' })
  relatedTo: string;

  @ApiProperty({ description: 'The model of the related item' })
  relatedModel: string;

  @ApiProperty({ description: 'The ID of the user who gave the feedback' })
  user: string;

  @ApiProperty({ description: 'The rating given by the user (1-5)' })
  rating: number;

  @ApiProperty({ description: 'The comment given by the user', required: false })
  comment?: string;

  @ApiProperty({ description: 'The date the feedback was created' })
  createdAt: Date;

  @ApiProperty({ description: 'The date the feedback was last updated' })
  updatedAt: Date;
}
