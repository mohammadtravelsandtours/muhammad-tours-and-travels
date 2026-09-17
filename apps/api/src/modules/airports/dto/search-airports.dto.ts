import { IsString, Length } from 'class-validator';

export class SearchAirportsDto {
  /** Free-text query — matched against IATA code, city, airport name, and country. */
  @IsString()
  @Length(1, 100)
  q!: string;
}
