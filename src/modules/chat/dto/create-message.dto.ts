import { IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiPropertyOptional({ description: 'Contenu texte du message' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'URL du fichier audio (uploade via POST /chat/upload-audio)',
  })
  @IsOptional()
  @IsString()
  @ValidateIf((dto: CreateMessageDto) => !dto.content)
  audioUrl?: string;
}
