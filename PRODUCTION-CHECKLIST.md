# Production Deployment Checklist

## 🔒 Security

- [ ] Change all default passwords and secrets
- [ ] Update `JWT_SECRET` to a strong random value (min 64 characters)
- [ ] Update `JWT_REFRESH_SECRET` to a different strong random value
- [ ] Configure CORS to only allow your frontend domains
- [ ] Enable HTTPS/SSL certificates (Let's Encrypt recommended)
- [ ] Set up firewall rules (UFW or iptables)
- [ ] Disable unnecessary ports (only 80, 443, 22 should be open)
- [ ] Configure fail2ban for SSH protection
- [ ] Review and update rate limiting settings
- [ ] Enable MongoDB authentication and encryption
- [ ] Rotate API keys and tokens regularly
- [ ] Set up security monitoring and alerts

## 🌐 Environment Configuration

- [ ] Update `.env` with production values
- [ ] Set `NODE_ENV=production`
- [ ] Configure `SERVER_URL` with production domain/IP
- [ ] Update `MONGO_URI` with production database
- [ ] Configure email service credentials
- [ ] Set up payment gateway credentials (Stripe, Flouci)
- [ ] Configure Google OAuth credentials
- [ ] Update CORS origins to production URLs
- [ ] Set appropriate file upload limits
- [ ] Configure timezone settings

## 🐳 Docker Configuration

- [ ] Review resource limits in docker-compose.yml
- [ ] Adjust memory limits based on VPS specs
- [ ] Configure logging rotation settings
- [ ] Set up volume backups for uploads
- [ ] Enable Docker auto-restart policies
- [ ] Configure health check intervals
- [ ] Set up Docker network isolation
- [ ] Review security options (capabilities, privileges)

## 📊 Monitoring & Logging

- [ ] Set up application monitoring (PM2, New Relic, or DataDog)
- [ ] Configure log aggregation (ELK stack or similar)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Configure error tracking (Sentry, Rollbar)
- [ ] Set up performance monitoring (APM)
- [ ] Create alerts for critical errors
- [ ] Monitor disk space usage
- [ ] Monitor memory and CPU usage
- [ ] Set up database monitoring
- [ ] Configure backup monitoring

## 💾 Backup Strategy

- [ ] Set up automated database backups (MongoDB Atlas backup)
- [ ] Configure file upload backups (S3, Backblaze)
- [ ] Test backup restoration process
- [ ] Set up backup retention policy (30 days recommended)
- [ ] Document backup procedures
- [ ] Set up off-site backup storage
- [ ] Schedule regular backup tests
- [ ] Configure backup alerts

## 🚀 Performance Optimization

- [ ] Enable Nginx reverse proxy with caching
- [ ] Configure CDN for static assets (CloudFlare, AWS CloudFront)
- [ ] Set up Redis for caching (if needed)
- [ ] Optimize database indexes
- [ ] Enable gzip compression
- [ ] Configure HTTP/2
- [ ] Set up connection pooling
- [ ] Optimize image serving
- [ ] Enable browser caching headers
- [ ] Review and optimize slow queries

## 🔄 CI/CD Pipeline

- [ ] Set up automated testing
- [ ] Configure deployment pipeline (GitHub Actions, GitLab CI)
- [ ] Set up staging environment
- [ ] Configure automated rollback mechanism
- [ ] Set up deployment notifications
- [ ] Document deployment process
- [ ] Create deployment runbook
- [ ] Set up blue-green deployment (optional)

## 📱 API Configuration

- [ ] Update API documentation with production URLs
- [ ] Configure rate limiting per endpoint
- [ ] Set up API versioning strategy
- [ ] Configure request/response validation
- [ ] Set up API analytics
- [ ] Configure webhook endpoints
- [ ] Test all API endpoints in production
- [ ] Update mobile app API URLs

## 🧪 Testing

- [ ] Run full test suite before deployment
- [ ] Test all critical user flows
- [ ] Verify payment processing
- [ ] Test file upload functionality
- [ ] Verify email sending
- [ ] Test authentication flows
- [ ] Verify database connections
- [ ] Test error handling
- [ ] Perform load testing
- [ ] Test backup restoration

## 📝 Documentation

- [ ] Update README with production setup
- [ ] Document environment variables
- [ ] Create runbook for common issues
- [ ] Document deployment process
- [ ] Create disaster recovery plan
- [ ] Document monitoring setup
- [ ] Create API documentation
- [ ] Document backup procedures
- [ ] Create troubleshooting guide

## 🔧 Infrastructure

- [ ] Set up domain name and DNS
- [ ] Configure SSL certificates
- [ ] Set up load balancer (if needed)
- [ ] Configure auto-scaling (if needed)
- [ ] Set up CDN
- [ ] Configure email service (SendGrid, AWS SES)
- [ ] Set up object storage (S3, Backblaze)
- [ ] Configure database replication (if needed)
- [ ] Set up VPN access for team

## 🎯 Post-Deployment

- [ ] Verify all services are running
- [ ] Check health endpoints
- [ ] Monitor error logs for 24 hours
- [ ] Verify database connections
- [ ] Test critical user flows
- [ ] Check performance metrics
- [ ] Verify backup jobs ran successfully
- [ ] Update status page
- [ ] Notify team of successful deployment
- [ ] Schedule post-deployment review

## 🚨 Emergency Contacts

- [ ] Document on-call rotation
- [ ] Create incident response plan
- [ ] Set up emergency communication channels
- [ ] Document rollback procedures
- [ ] Create escalation matrix
- [ ] Set up status page for users

## 📊 Metrics to Monitor

- Response time (target: < 200ms)
- Error rate (target: < 1%)
- Uptime (target: > 99.9%)
- CPU usage (target: < 70%)
- Memory usage (target: < 80%)
- Disk usage (target: < 80%)
- Database connections
- API request rate
- File upload success rate
- Payment success rate

## 🔄 Regular Maintenance

- [ ] Weekly: Review error logs
- [ ] Weekly: Check disk space
- [ ] Weekly: Review performance metrics
- [ ] Monthly: Update dependencies
- [ ] Monthly: Security audit
- [ ] Monthly: Backup restoration test
- [ ] Quarterly: Load testing
- [ ] Quarterly: Disaster recovery drill
- [ ] Yearly: SSL certificate renewal
- [ ] Yearly: Security penetration testing
