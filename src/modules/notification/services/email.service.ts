import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SendMailOptions } from 'nodemailer';
import * as handlebars from 'handlebars';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
    EmailTemplate,
    NotificationRecipient,
    EmailConfig
} from '../interfaces/notification.interface';
import { RetryManager } from '../../../common/utils/retry.util';

@Injectable()
export class EmailService implements OnModuleInit {
    private readonly transporter: nodemailer.Transporter;
    private readonly logger = new Logger(EmailService.name);
    private readonly templateCache: Map<string, handlebars.TemplateDelegate> = new Map();
    private readonly retryManager: RetryManager;
    private readonly requiredConfigs = [
        'EMAIL_HOST',
        'EMAIL_PORT',
        'EMAIL_USER',
        'EMAIL_PASSWORD',
        'EMAIL_FROM'
    ];

    constructor(private readonly configService: ConfigService) {
        this.validateConfigs();
        this.retryManager = new RetryManager();

        // Use environment variables directly since they're validated
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT || '587', 10),
            secure: process.env.EMAIL_PORT === '465',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            rateLimit: 5,
            tls: {
                rejectUnauthorized: true
            },
            socketTimeout: 30000,
            connectionTimeout: 30000
        });
    }

    async onModuleInit() {
        try {
            await this.validateTemplates();
            await this.verifyConnection();
            this.logger.log('Email service initialized successfully');
        } catch (error) {
            this.logger.error('Email service initialization failed', error.stack);
            throw error;
        }
    }

    private validateConfigs(): void {
        const config = this.configService.get('app.email');
        console.log('Full config:', this.configService.get('app'));
        console.log('Email config section:', config);

        const missingConfigs: string[] = [];

        // Check raw env variables first
        if (!process.env.EMAIL_HOST) missingConfigs.push('EMAIL_HOST');
        if (!process.env.EMAIL_USER) missingConfigs.push('EMAIL_USER');
        if (!process.env.EMAIL_PASSWORD) missingConfigs.push('EMAIL_PASSWORD');
        if (!process.env.EMAIL_FROM) missingConfigs.push('EMAIL_FROM');

        if (missingConfigs.length > 0) {
            throw new Error(`Missing required email configs: ${missingConfigs.join(', ')}`);
        }
    }

    private async validateTemplates(): Promise<void> {
        const templatePath = join(process.cwd(), 'src/modules/notification/templates');
        try {
            await fs.access(templatePath);
            const files = await fs.readdir(templatePath);
            const templateFiles = files.filter(file => file.endsWith('.hbs'));

            if (templateFiles.length === 0) {
                throw new Error('No email templates found');
            }

            for (const file of templateFiles) {
                const content = await fs.readFile(join(templatePath, file), 'utf-8');
                try {
                    const template = handlebars.compile(content);
                    this.templateCache.set(file.replace('.hbs', ''), template);
                } catch (error) {
                    throw new Error(`Invalid template ${file}: ${error.message}`);
                }
            }
        } catch (error) {
            throw new Error(`Template validation failed: ${error.message}`);
        }
    }

    async sendEmail(
        recipient: NotificationRecipient,
        template: EmailTemplate,
        config?: EmailConfig
    ): Promise<boolean> {
        if (!this.validateEmailAddress(recipient.email)) {
            this.logger.error(`Invalid email address: ${recipient.email}`);
            return false;
        }

        return this.retryManager.withRetry(
            async () => {
                const htmlContent = await this.compileTemplate(template.template, template.data);

                const fromEmail = this.configService.get<string>('EMAIL_FROM');
                if (!fromEmail) {
                    throw new Error('EMAIL_FROM configuration is missing');
                }

                const mailOptions: SendMailOptions = {
                    from: config?.from?.address ? {
                        name: config.from.name || 'Hall of Fame',
                        address: config.from.address
                    } : fromEmail,
                    to: recipient.name ? {
                        name: recipient.name,
                        address: recipient.email
                    } : recipient.email,
                    subject: template.subject,
                    html: htmlContent,
                    replyTo: config?.replyTo || fromEmail,
                    attachments: config?.attachments,
                    headers: {
                        'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        'X-Priority': '1'
                    }
                };

                const result = await this.transporter.sendMail(mailOptions);
                this.logger.log(`Email sent successfully to ${recipient.email} [MessageId: ${result.messageId}]`);
                return true;
            },
            'sendEmail',
            {
                maxRetries: 3,
                initialDelay: 1000,
                retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']
            }
        );
    }

    private validateEmailAddress(email: string): boolean {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email);
    }

    private async compileTemplate(
        templateName: string,
        data: Record<string, any>
    ): Promise<string> {
        try {
            let template = this.templateCache.get(templateName);

            if (!template) {
                const templatePath = join(
                    process.cwd(),
                    'src/modules/notification/templates',
                    `${templateName}.hbs`
                );

                try {
                    const templateContent = await fs.readFile(templatePath, 'utf-8');
                    template = handlebars.compile(templateContent);
                    this.templateCache.set(templateName, template);
                } catch (error) {
                    throw new Error(`Template ${templateName} not found or invalid`);
                }
            }

            const enrichedData = {
                ...data,
                appName: 'Hall of Fame',
                year: new Date().getFullYear(),
                supportEmail: this.configService.get('EMAIL_FROM'),
                timestamp: new Date().toISOString()
            };

            return template(enrichedData);
        } catch (error) {
            this.logger.error(
                `Template compilation failed: ${error.message}`,
                error.stack
            );
            throw error;
        }
    }

    async verifyConnection(): Promise<boolean> {
        try {
            await this.transporter.verify();
            return true;
        } catch (error) {
            this.logger.error('Email service verification failed', error.stack);
            return false;
        }
    }

    async sendTestEmail(toEmail: string): Promise<boolean> {
        if (!this.validateEmailAddress(toEmail)) {
            throw new Error('Invalid email address');
        }

        return this.sendEmail(
            { email: toEmail },
            {
                subject: 'Email Configuration Test',
                template: 'test-email',
                data: {
                    timestamp: new Date().toISOString()
                }
            }
        );
    }
}