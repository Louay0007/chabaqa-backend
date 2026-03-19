import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum PostShareMethod {
  NATIVE = 'native',
  COPY_LINK = 'copy_link',
  WHATSAPP = 'whatsapp',
  X = 'x',
  FACEBOOK = 'facebook',
  LINKEDIN = 'linkedin',
  TELEGRAM = 'telegram',
  EMAIL = 'email',
}

export class SharePostRequestDto {
  @ApiPropertyOptional({
    description: 'How the user shared the post',
    enum: PostShareMethod,
    example: PostShareMethod.COPY_LINK,
  })
  @IsOptional()
  @IsEnum(PostShareMethod)
  method?: string;

  @ApiPropertyOptional({
    description: 'Target URL used for sharing (if applicable)',
    example: 'https://chabaqa.io/Creator/chabaqa-test/home?post=abc123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  targetUrl?: string;
}

