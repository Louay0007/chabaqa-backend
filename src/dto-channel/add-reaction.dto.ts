import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddReactionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  emoji: string;
}
