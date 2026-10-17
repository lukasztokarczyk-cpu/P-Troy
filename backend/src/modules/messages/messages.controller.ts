import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageDto, ReplyMessageDto } from './dto/message.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('inbox')
  findInbox(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.findInbox(user.id);
  }

  @Post()
  send(@Body() dto: CreateMessageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.send(dto, user.id);
  }

  // Rozmowa, do której należy wiadomość (też z powiadomienia z dzwonka). 404 = nie istnieje, 403 = brak uprawnień.
  @Get(':id/thread')
  thread(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.getThread(id, user.id);
  }

  @Post(':id/reply')
  reply(@Param('id') id: string, @Body() dto: ReplyMessageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.reply(id, dto.content, user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.markRead(id, user.id);
  }
}
