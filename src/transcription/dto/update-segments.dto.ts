import { IsArray, IsNumber, IsString } from 'class-validator';

class SegmentDto {
  @IsNumber()
  start: number;

  @IsNumber()
  end: number;

  @IsString()
  text: string;
}

export class UpdateSegmentsDto {
  @IsArray()
  segments: SegmentDto[];
}
