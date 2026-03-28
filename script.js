// DARPA SOLUTIONS LLC - Main JavaScript
// Mobile Navigation, Scroll Animations, Equipment Tabs, Form Handling

document.addEventListener('DOMContentLoaded', function () {

    // ==========================================
    // Load Navbar & Footer Templates
    // ==========================================
    async function loadComponents() {
        try {
            // Detect if we're in a subfolder
            const pathDepth = window.location.pathname.split('/').filter(p => p && p.includes('.html')).length > 0
                && !window.location.pathname.endsWith('/index.html')
                && window.location.pathname.includes('/')
                ? '../' : '';

            // Load navbar
            const navbarPlaceholder = document.getElementById('navbar-placeholder');
            if (navbarPlaceholder) {
                const navResponse = await fetch(`${pathDepth}navbar-template.html`);
                const navHTML = await navResponse.text();
                navbarPlaceholder.innerHTML = navHTML;
                
                // Fix paths in navbar based on context
                adjustTemplatePaths(navbarPlaceholder, pathDepth);
            }

            // Load footer
            const footerPlaceholder = document.getElementById('footer-placeholder');
            if (footerPlaceholder) {
                const footerResponse = await fetch(`${pathDepth}footer-template.html`);
                const footerHTML = await footerResponse.text();
                footerPlaceholder.innerHTML = footerHTML;
                
                // Fix paths in footer based on context
                adjustTemplatePaths(footerPlaceholder, pathDepth);
            }

            // Initialize all functionality after components load
            initializeFeatures();
        } catch (error) {
            console.error('Error loading components:', error);
            initializeFeatures(); // Still run if templates fail
        }
    }

    // ==========================================
    // Adjust Template Paths Based on Context
    // ==========================================
    function adjustTemplatePaths(container, pathDepth) {
        if (!pathDepth) return; // We're at root, no adjustment needed
        
        // Fix all links
        container.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('../')) {
                link.setAttribute('href', '../' + href);
            }
        });
        
        // Fix all images
        container.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('../')) {
                img.setAttribute('src', '../' + src);
            }
        });
    }

    // ==========================================
    // Initialize All Features
    // ==========================================
    function initializeFeatures() {

    // ==========================================
    // Shared Promo Banner Injection
    // ==========================================
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    const promoBannerContent = {
        'index.html': {
            message: 'Need consultation, verification, training, or equipment support? Contact DARPA SOLUTIONS LLC to discuss your facility needs.',
            cta: 'Contact Us'
        },
        'about.html': {
            message: 'Learn more about the experience, compliance knowledge, and field expertise behind DARPA SOLUTIONS LLC.',
            cta: 'Work With Us'
        },
        'services.html': {
            message: 'Need consultation, verification, maintenance, or emergency support? Talk with us about NFPA 99 compliant service coverage.',
            cta: 'Request Service'
        },
        'classes.html': {
            message: 'Ready to register for ASSE 6010, 6020, or 6040 training? Contact us for upcoming class dates and availability.',
            cta: 'Ask About Classes'
        },
        'students.html': {
            message: 'Need certification renewal help or student resources? Reach out for support, forms, and current training information.',
            cta: 'Get Student Help'
        },
        'privacy.html': {
            message: 'Questions about privacy or how we handle submitted information? Contact DARPA SOLUTIONS LLC for clarification.',
            cta: 'Contact Us'
        },
        'licensing.html': {
            message: 'Need permission to use DARPA SOLUTIONS content or branding? Review the terms and contact us for approval requests.',
            cta: 'Request Permission'
        }
    };

    function injectSharedPromoBanner() {
        if (currentPage === 'contact.html') return;

        function placeBannerUnderNavbar(bannerElement) {
            const navbarPlaceholder = document.getElementById('navbar-placeholder');
            const header = document.querySelector('.header');

            if (navbarPlaceholder) {
                navbarPlaceholder.insertAdjacentElement('afterend', bannerElement);
                return;
            }

            if (header) {
                header.insertAdjacentElement('afterend', bannerElement);
            }
        }

        const existingBanner = document.querySelector('.eq-promo-banner, .site-promo-banner');
        if (existingBanner) {
            placeBannerUnderNavbar(existingBanner);
            return;
        }

        const bannerContent = promoBannerContent[currentPage];
        if (!bannerContent) return;

        const contactHref = currentPage === 'index.html'
            ? 'contact/contact.html'
            : '../contact/contact.html';

        const tickerMarkup = new Array(3)
            .fill(`${bannerContent.message} &nbsp;&nbsp;&bull;&nbsp;&nbsp;`)
            .map(message => `<span class="ticker-item">${message}</span>`)
            .join('');

        const banner = document.createElement('section');
        banner.className = 'site-promo-banner';
        banner.innerHTML = `
            <div class="promo-ticker">
                <div class="promo-ticker-track">
                    ${tickerMarkup}
                </div>
            </div>
            <div class="container promo-cta-wrap">
                <a href="${contactHref}" class="btn-white">${bannerContent.cta}</a>
            </div>
        `;

        placeBannerUnderNavbar(banner);
    }

    injectSharedPromoBanner();

    // ==========================================
    // Navbar Tab Animations
    // ==========================================
    const navLinks = document.querySelectorAll('.nav-menu a:not(.btn-nav)');
    
    navLinks.forEach(link => {
        // Add smooth scale animation on hover
        link.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.05)';
            this.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        });
        
        link.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
        });
    });

    // Add ripple effect on click
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.style.position = 'absolute';
            ripple.style.borderRadius = '50%';
            ripple.style.background = 'rgba(30, 64, 175, 0.3)';
            ripple.style.width = ripple.style.height = '100px';
            ripple.style.left = e.offsetX - 50 + 'px';
            ripple.style.top = e.offsetY - 50 + 'px';
            ripple.style.animation = 'ripple 0.6s ease-out';
            ripple.style.pointerEvents = 'none';
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    });

    // Add ripple animation to CSS dynamically
    if (!document.getElementById('ripple-animation')) {
        const style = document.createElement('style');
        style.id = 'ripple-animation';
        style.textContent = `
            @keyframes ripple {
                from { transform: scale(0); opacity: 1; }
                to { transform: scale(2); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // ==========================================
    // Mobile Navigation Toggle
    // ==========================================
    const mobileToggle = document.querySelector('.mobile-toggle');
    const navMenu = document.querySelector('.nav-menu');

    if (mobileToggle) {
        mobileToggle.addEventListener('click', function () {
            navMenu.classList.toggle('active');

            const spans = this.querySelectorAll('span');
            if (navMenu.classList.contains('active')) {
                spans[0].style.transform = 'rotate(45deg) translateY(10px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translateY(-10px)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });

        // Close mobile menu when clicking a link
        document.querySelectorAll('.nav-menu a').forEach(link => {
            link.addEventListener('click', function () {
                navMenu.classList.remove('active');
                const spans = mobileToggle.querySelectorAll('span');
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            });
        });
    }

    // ==========================================
    // Active Navigation Highlighting
    // ==========================================
    document.querySelectorAll('.nav-menu a').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
            link.classList.add('active');
        }
    });

    // ==========================================
    // Scroll Animations – Fade In & Slide
    // ==========================================
    const animObserver = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        },
        { threshold: 0.1, rootMargin: '0px 0px -100px 0px' }
    );

    document.querySelectorAll(
        '.service-card, .training-content, .training-images, ' +
        '.equipment-text, .equipment-image, .cta-text, .cta-info, ' +
        '.section-header, .hero-content, .hero-images, ' +
        '.card, .service-card-large, .course-card, .equipment-card, ' +
        '.stat-item, .stat-row, .stats-panel, .feature-card, ' +
        '.resource-card, .policy-card, .intro-item, .compliance-item, ' +
        '.office-card, .faq-item, .svc-block, .founder-card, ' +
        '.timeline-item, .portal-card, .help-card, .about-hero, ' +
        '.svc-hero-content, .cls-hero, .hero-inner, .image-card'
    ).forEach(el => animObserver.observe(el));

    // Staggered delay for cards
    document.querySelectorAll('.service-card, .course-card, .equipment-card, .resource-card, .office-card, .faq-item').forEach((card, i) => {
        card.style.animationDelay = `${i * 0.1}s`;
    });

    // ==========================================
    // Equipment Tabs Functionality
    // ==========================================
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // ==========================================
    // Contact Form Handler (sends to /api/contact)
    // ==========================================
    const contactForm = document.getElementById('contactForm');

    if (contactForm) {
        const submitBtn = contactForm.querySelector('.btn-submit');

        contactForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            // Prevent double-submit
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending…';
            }

            // Collect values using the existing name attributes
            const formData = {
                full_name:    (contactForm.querySelector('[name="full_name"]')    || {}).value || '',
                organization: (contactForm.querySelector('[name="organization"]') || {}).value || '',
                email:        (contactForm.querySelector('[name="email"]')        || {}).value || '',
                phone:        (contactForm.querySelector('[name="phone"]')        || {}).value || '',
                subject:      (contactForm.querySelector('[name="subject"]')      || {}).value || '',
                message:      (contactForm.querySelector('[name="message"]')      || {}).value || '',
                website:      (contactForm.querySelector('[name="website"]')      || {}).value || '', // honeypot
            };

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // Success — reset form and show confirmation
                    contactForm.reset();
                    contactForm.querySelectorAll('input, select, textarea').forEach(function (input) {
                        input.style.borderColor = '#e2e8f0';
                    });
                    showFormMessage('Thank you! Your message has been sent. We will respond within 24 business hours.', 'success');
                } else {
                    // Validation or server errors
                    const msg = result.errors
                        ? result.errors.join(' ')
                        : result.error || 'Something went wrong. Please try again.';
                    showFormMessage(msg, 'error');
                }
            } catch (err) {
                showFormMessage('Network error. Please check your connection and try again.', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Send Message';
                }
            }
        });

        // Helper: show a status message above the submit button
        function showFormMessage(text, type) {
            // Remove any previous message
            const prev = contactForm.querySelector('.form-status-msg');
            if (prev) prev.remove();

            const msg = document.createElement('div');
            msg.className = 'form-status-msg';
            msg.textContent = text;
            msg.style.padding = '14px 18px';
            msg.style.borderRadius = '8px';
            msg.style.fontSize = '14px';
            msg.style.fontWeight = '600';
            msg.style.marginBottom = '16px';

            if (type === 'success') {
                msg.style.background = '#ecfdf5';
                msg.style.color = '#065f46';
                msg.style.border = '1px solid #a7f3d0';
            } else {
                msg.style.background = '#fef2f2';
                msg.style.color = '#991b1b';
                msg.style.border = '1px solid #fecaca';
            }

            // Insert before the submit button
            if (submitBtn) {
                submitBtn.insertAdjacentElement('beforebegin', msg);
            } else {
                contactForm.appendChild(msg);
            }

            // Auto-dismiss after 8 seconds
            setTimeout(function () { msg.remove(); }, 8000);
        }
    }

    // ==========================================
    // Form Input Validation Visual Feedback
    // ==========================================
    document.querySelectorAll('input[required], select[required], textarea[required]').forEach(input => {
        input.addEventListener('blur', function () {
            this.style.borderColor = this.value.trim() === '' ? '#ef4444' : '#10b981';
        });
        input.addEventListener('focus', function () {
            this.style.borderColor = '#3b82f6';
        });
    });

    // ==========================================
    // Smooth Scroll for Anchor Links
    // ==========================================
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId !== '#' && targetId.length > 1) {
                e.preventDefault();
                const el = document.querySelector(targetId);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // ==========================================
    // Header Shadow on Scroll
    // ==========================================
    const header = document.querySelector('.header');

    if (header) {
        window.addEventListener('scroll', function () {
            header.style.boxShadow =
                window.pageYOffset > 50
                    ? '0 2px 20px rgba(0, 0, 0, 0.08)'
                    : 'none';
        });
    }

    // ==========================================
    // Parallax Effect for Hero Images
    // ==========================================
    const heroImages = document.querySelector('.hero-images');

    if (heroImages) {
        window.addEventListener('scroll', function () {
            const scrolled = window.pageYOffset;
            if (scrolled < 600) {
                heroImages.style.transform = `translateY(${scrolled * 0.3}px)`;
            }
        });
    }

    // ==========================================
    // Number Counter Animation
    // ==========================================
    function animateCounter(element, target, duration) {
        duration = duration || 2000;
        let start = 0;
        const increment = target / (duration / 16);

        const timer = setInterval(() => {
            start += increment;
            if (start >= target) {
                element.textContent = target;
                clearInterval(timer);
            } else {
                element.textContent = Math.floor(start);
            }
        }, 16);
    }

    const stats = document.querySelectorAll('.stat-number');
    if (stats.length) {
        const statsObserver = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const target = parseInt(entry.target.getAttribute('data-target'), 10);
                        animateCounter(entry.target, target);
                        statsObserver.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.5 }
        );
        stats.forEach(stat => statsObserver.observe(stat));
    }

    // ==========================================
    // Back to Top Button
    // ==========================================
    const backToTop = document.createElement('button');
    backToTop.innerHTML = '&#8593;';
    backToTop.className = 'back-to-top';
    backToTop.setAttribute('aria-label', 'Back to top');
    document.body.appendChild(backToTop);

    window.addEventListener('scroll', function () {
        if (window.pageYOffset > 400) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    });

    backToTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ==========================================
    // Image Lazy Loading Enhancement
    // ==========================================
    const lazyImages = document.querySelectorAll('img[data-src]');

    if (lazyImages.length) {
        const imageObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.getAttribute('data-src');
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            });
        });
        lazyImages.forEach(img => imageObserver.observe(img));
    }

    // ==========================================
    // Console Welcome Message
    // ==========================================
    console.log('%c DARPA SOLUTIONS LLC ', 'background: #1e40af; color: white; font-size: 16px; padding: 10px; font-weight: bold;');
    console.log('%c Professional Medical Gas System Management & Training ', 'color: #1e40af; font-size: 12px;');

    } // End initializeFeatures

    // Load components and initialize
    loadComponents();
});
