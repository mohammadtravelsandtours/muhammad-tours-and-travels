import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, what: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException(`${what} is not a valid id`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(pkg: any) {
  return {
    id: pkg.id,
    packageReference: pkg.packageReference,
    currency: pkg.currency,
    totalAmount: Number(pkg.totalAmount),
    createdAt: pkg.createdAt,
    flightBooking: pkg.flightBooking && { id: pkg.flightBooking.id, bookingReference: pkg.flightBooking.bookingReference, status: pkg.flightBooking.status },
    hotelBooking: pkg.hotelBooking && {
      id: pkg.hotelBooking.id,
      bookingReference: pkg.hotelBooking.bookingReference,
      status: pkg.hotelBooking.status,
      property: pkg.hotelBooking.offer?.property ? { name: pkg.hotelBooking.offer.property.name, city: pkg.hotelBooking.offer.property.city } : undefined,
    },
  };
}

/**
 * Bundles two already-CONFIRMED bookings (one flight, one hotel — each
 * created through its own normal endpoint) into a single shared
 * reference — see PackagesService's doc comment for why this isn't a
 * third parallel booking pipeline.
 */
@UseGuards(JwtAuthGuard)
@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
  async create(@Body() dto: CreatePackageDto, @CurrentUser() user: AuthenticatedUser) {
    return serialize(await this.packagesService.create(user, dto));
  }

  @Get()
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const packages = await this.packagesService.listMine(user);
    return { packages: packages.map((p) => serialize(p)) };
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id, 'id');
    return serialize(await this.packagesService.getOne(user, id));
  }
}
