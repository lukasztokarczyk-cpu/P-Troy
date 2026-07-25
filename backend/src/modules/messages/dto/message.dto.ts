import { IsString, IsArray, ArrayMinSize, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  content: string;

  // Jeden lub wielu odbiorców — wiadomość jest widoczna WYŁĄCZNIE dla
  // nadawcy i osób na tej liście (egzekwowane w MessagesService.findInbox)
  @IsArray()
  @ArrayMinSize(1, { message: 'Wskaż przynajmniej jednego odbiorcę' })
  @IsString({ each: true })
  recipientIds: string[];
}
