import { ApiProperty } from '@nestjs/swagger';

export class EventQrTokenPayloadDto {
  @ApiProperty()
  sub: string;

  @ApiProperty()
  eventId: string;

  @ApiProperty()
  attendeeId: string;

  @ApiProperty()
  ticketType: string;

  @ApiProperty()
  issuedAt: string;
}

export class EventQrTokenResponseDto {
  @ApiProperty()
  token: string;

  @ApiProperty({ type: EventQrTokenPayloadDto })
  payload: EventQrTokenPayloadDto;

  @ApiProperty()
  expiresIn: string;
}
