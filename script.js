// DARPA Solutions LLC - Main JavaScript
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
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

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
    // Contact Form Handler
    // ==========================================
    const contactForm = document.getElementById('contactForm');

    if (contactForm) {
        contactForm.addEventListener('submit', function (e) {
            e.preventDefault();

            alert('Thank you for your message! This form will be connected to our email system in Phase 2. We will contact you soon.');

            contactForm.reset();

            contactForm.querySelectorAll('input, select, textarea').forEach(input => {
                input.style.borderColor = '#e2e8f0';
            });
        });
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
    console.log('%c DARPA Solutions LLC ', 'background: #1e40af; color: white; font-size: 16px; padding: 10px; font-weight: bold;');
    console.log('%c Professional Medical Gas System Management & Training ', 'color: #1e40af; font-size: 12px;');

    } // End initializeFeatures

    // Load components and initialize
    loadComponents();
});
