import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum AiAssistAction {
  BRAINSTORM = 'brainstorm',
  IMPROVE = 'improve',
  EXPAND = 'expand',
  SHORTEN = 'shorten',
  REWRITE = 'rewrite',
  SUMMARIZE = 'summarize',
}

export class ContentAssistDto {
  @IsEnum(AiAssistAction)
  @IsNotEmpty()
  action: AiAssistAction;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  text: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  context?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  tone?: string;
}
