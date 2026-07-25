import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/message.dto';
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

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.markRead(id, user.id);
  }
}
