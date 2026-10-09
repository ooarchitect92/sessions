import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SecurityService } from './security.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        },
      }),
    }),
    AuditModule,
    BillingModule,
    OutboxModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, SecurityService],
  exports: [JwtModule, AuthService, SecurityService],
})
export class AuthModule {}
