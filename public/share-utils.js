// Share utilities for social network integration
// This module provides a centralized place for share functionality
// that can be easily extended for additional networks

const ShareUtils = {
    // Detect if the user is on a mobile device
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    // WhatsApp share
    shareToWhatsApp(url, customMessage = null) {
        const message = customMessage || `Join our video interview room: ${url}`;
        const encodedMessage = encodeURIComponent(message);
        
        const whatsappUrl = this.isMobile() 
            ? `whatsapp://send?text=${encodedMessage}`
            : `https://wa.me/?text=${encodedMessage}`;
        
        window.open(whatsappUrl, '_blank');
    },

    // TODO: Add more social networks as needed
    // Examples of future integrations:
    
    // LinkedIn share
    shareToLinkedIn(url, title = 'Video Interview Room') {
        const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        window.open(linkedInUrl, '_blank');
    },

    // Email share
    shareViaEmail(url, subject = 'Video Interview Invitation', body = null) {
        const emailBody = body || `You're invited to join our video interview room:\n\n${url}`;
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
        window.location.href = mailtoUrl;
    },

    // Slack share (requires Slack app integration)
    shareToSlack(url, message = null) {
        const slackMessage = message || `Join our video interview room: ${url}`;
        // Note: This would require Slack OAuth integration for full functionality
        // For now, just copy to clipboard with a Slack-formatted message
        const slackFormatted = `Join our video interview room:\n<${url}|Click here to join>`;
        navigator.clipboard.writeText(slackFormatted);
        return 'Slack message copied to clipboard';
    },

    // Microsoft Teams share (requires Teams integration)
    shareToTeams(url) {
        // Note: Full Teams integration would require Microsoft Graph API
        // Basic implementation would use Teams deep link
        const teamsUrl = `https://teams.microsoft.com/share?href=${encodeURIComponent(url)}`;
        window.open(teamsUrl, '_blank');
    },

    // Telegram share
    shareToTelegram(url, text = 'Join our video interview room') {
        const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        window.open(telegramUrl, '_blank');
    },

    // SMS share (mobile only)
    shareViaSMS(url, message = null) {
        if (!this.isMobile()) {
            console.warn('SMS sharing is only available on mobile devices');
            return false;
        }
        const smsBody = message || `Join our video interview room: ${url}`;
        const smsUrl = `sms:?body=${encodeURIComponent(smsBody)}`;
        window.location.href = smsUrl;
    },

    // Generic share using Web Share API (if available)
    async shareNative(url, title = 'Video Interview Room', text = 'Join our video interview') {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: title,
                    text: text,
                    url: url
                });
                return true;
            } catch (err) {
                console.error('Error sharing:', err);
                return false;
            }
        } else {
            console.warn('Web Share API not supported');
            return false;
        }
    },

    // Copy link to clipboard
    async copyToClipboard(url) {
        try {
            await navigator.clipboard.writeText(url);
            return true;
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        }
    }
};

// Export for use in other files if using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShareUtils;
}