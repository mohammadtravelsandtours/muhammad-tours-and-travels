import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { ChatDto } from './dto/chat.dto';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@mohammad-travels/types';

/**
 * Optionally-authenticated, like /flights/search — a B2C visitor should
 * be able to ask a general question before creating an account. See
 * AiAssistantService's doc comment for what this can and can't do.
 */
@Controller('assistant')
export class AiAssistantController {
  constructor(private readonly assistant: AiAssistantService) {}

  @Get('status')
  status() {
    return { configured: this.assistant.isConfigured() };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('chat')
  async chat(@Body() dto: ChatDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.assistant.chat(dto, user);
  }
}
