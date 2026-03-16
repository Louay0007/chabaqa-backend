import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReactPostDto {
  @ApiProperty({
    description: 'Emoji reaction to toggle',
    example: '👍',
    maxLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  emoji: string;
}
