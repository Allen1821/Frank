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
    // Course Photo Galleries
    // ==========================================
    const courseGalleryGroups = [
        {
            id: 'course-gallery-classroom',
            title: 'Classroom Instruction',
            description: 'Lesson screens, tabletop components, and classroom demonstrations used for code review and exam preparation.',
            images: [
                ['Classroom/Classroom.jpg', 'Medical gas training classroom arranged for students', 'Classroom setup for ASSE 6000 Series instruction.', true],
                ['Classroom/image.jpg', 'Instructor tabletop demonstration with medical gas components', 'Tabletop component demonstration.'],
                ['Classroom/image10.jpg', 'Medical gas training components arranged on a classroom table', 'Training parts and outlet assemblies.'],
                ['Classroom/image2.jpg', 'Hands-on classroom demonstration with medical gas outlets', 'Hands-on outlet review.'],
                ['Classroom/image3.jpg', 'Classroom demonstration of medical gas device parts', 'Device parts and inspection details.'],
                ['Classroom/image4.jpg', 'Medical gas classroom component practice at a table', 'Component handling practice.'],
                ['Classroom/image5.jpg', 'Instructor demonstrating medical gas outlet assembly', 'Outlet assembly demonstration.'],
                ['Classroom/image6.jpg', 'Medical gas outlet and training pieces on a classroom table', 'Training pieces for classroom review.'],
                ['Classroom/image7.jpg', 'Medical gas component practice setup in classroom', 'Hands-on component setup.'],
                ['Classroom/image8.jpg', 'Medical gas classroom demonstration with outlet assemblies', 'Outlet identification practice.'],
                ['Classroom/image9.jpg', 'Medical gas training components arranged for class', 'Classroom parts review.'],
                ['Classroom/IMG_3133.jpg', 'Medical gas course materials and devices on a classroom table', 'Course materials and demonstration devices.'],
                ['Classroom/lesson2.jpg', 'Classroom display showing medical gas course lesson material', 'Lesson display for code review.'],
                ['Classroom/lesson3.jpg', 'Medical gas lesson slide shown on classroom display', 'System diagram lesson slide.'],
                ['Classroom/Lesson4.jpg', 'Medical gas classroom lesson displayed on wall monitor', 'Component identification lesson.'],
                ['Classroom/Lessons.jpg', 'Medical gas operating systems course page shown on classroom display', 'Operating systems lesson material.'],
                ['Classroom/Lessons5.jpg', 'Medical gas inspection lesson shown on classroom display', 'Inspection and documentation lesson.']
            ]
        },
        {
            id: 'course-gallery-lab',
            title: 'Medical Gas Systems Training Lab',
            description: 'Wall assemblies, piping runs, manifold equipment, and lab corners used for practical demonstrations.',
            images: [
                ['Medical Gas Systems Training Lab.jpg', 'Medical gas systems training lab with wall piping assemblies', 'Training lab with wall-mounted piping assemblies.', true],
                ['Medical Gas Systems Training Lab_2.jpg', 'Medical gas training lab with piping routed across wall panels', 'Wall-mounted medical gas piping runs.'],
                ['Medical Gas Systems Training Lab Conor.jpg', 'Corner view of medical gas training lab piping', 'Corner lab view with overhead piping.'],
                ['Medical Gas Systems Training Lab Conor2.jpg', 'Second corner view of medical gas training lab piping', 'Second lab corner and system routing.'],
                ['Medical Gas Manifold System..jpg', 'Medical gas manifold system with regulators and piping', 'Manifold system used for equipment layout review.']
            ]
        },
        {
            id: 'course-gallery-trainer-one',
            title: 'Medical Gas Operating Systems Trainer 1',
            description: 'Inside and outside trainer views used to explain basic operating trainer layout.',
            images: [
                ['Medical Gas Operating Systems Trainer 1/Medical Gas Operating Systems Trainer outside.jpg', 'Outside view of medical gas operating systems trainer 1', 'Trainer 1 exterior view.'],
                ['Medical Gas Operating Systems Trainer 1/Medical Gas Operating Systems Trainer room 1.jpg', 'Room-side view of medical gas operating systems trainer 1', 'Trainer 1 room-side view.']
            ]
        },
        {
            id: 'course-gallery-trainer-two',
            title: 'Medical Gas Operating Systems Trainer 2',
            description: 'Trainer exterior, interior, and emergency room zone valve assemblies.',
            images: [
                ['Medical Gas Operating Systems Trainer 2/Medical Gas Operating Systems Trainer outside2.jpg', 'Outside view of medical gas operating systems trainer 2', 'Trainer 2 exterior and system layout.', true],
                ['Medical Gas Operating Systems Trainer 2/Medical Gas Operating Systems Trainer inside 2.png', 'Inside view of medical gas operating systems trainer 2', 'Trainer 2 interior components.'],
                ['Medical Gas Operating Systems Trainer 2/EMERGENCY ROOM ZONE VALVES.jpg', 'Emergency room medical gas zone valve assemblies', 'Emergency room zone valve assemblies.']
            ]
        },
        {
            id: 'course-gallery-trainer-three',
            title: 'Medical Gas Operating Systems Trainer 3',
            description: 'Control units, gauges, zone valve boxes, safety equipment, and trainer views for maintenance and inspection discussion.',
            images: [
                ['Medical Gas Operating Systems Trainer 3/Medical Gas Operating Systems Trainer outside 3.jpg', 'Outside view of medical gas operating systems trainer 3', 'Trainer 3 exterior and operating layout.', true],
                ['Medical Gas Operating Systems Trainer 3/Medical Gas Operating Systems Trainer inside 2 guage.jpg', 'Gauges and components inside medical gas operating systems trainer 3', 'Gauge and component review.'],
                ['Medical Gas Operating Systems Trainer 3/Control unit 3.jpg', 'Control unit on medical gas operating systems trainer 3', 'Control unit for operating conditions.'],
                ['Medical Gas Operating Systems Trainer 3/IMG_3042.jpg', 'Medical gas operating systems trainer 3 component area', 'Trainer 3 component area.'],
                ['Medical Gas Operating Systems Trainer 3/medical gas zone valve box.jpg', 'Medical gas zone valve box on trainer 3', 'Zone valve box and labeling.'],
                ['Medical Gas Operating Systems Trainer 3/Safety_Equipment.jpg', 'Safety equipment area in the medical gas training lab', 'Safety equipment and lab preparation area.']
            ]
        },
        {
            id: 'course-gallery-brazing',
            title: 'Copper Flame and Brazing Practice',
            description: 'Brazing photos show flame control, copper orientation, and station setup for ASSE 6010 practical work.',
            courses: ['6010'],
            images: [
                ['Copper_Flame/Copper_Horzontal.png', 'Horizontal copper tubing brazing practice with blue flame', 'Horizontal copper brazing practice.', true],
                ['Copper_Flame/Copper.png', 'Vertical copper tubing brazing practice with blue flame', 'Vertical copper brazing technique.'],
                ['Copper_Flame/Rig.png', 'Brazing rig set up in the training lab', 'Brazing rig and station setup.'],
                ['Copper_Flame/rig_2.png', 'Second brazing rig view in the training lab', 'Second view of the brazing work area.']
            ]
        }
    ];

    function renderCourseGalleries() {
        const courseMatch = document.body.className.match(/\bcourse-(\d{4})\b/);
        const currentCourseCode = courseMatch ? courseMatch[1] : '';

        document.querySelectorAll('[data-course-gallery]').forEach(section => {
            const container = section.querySelector('.container');
            if (!container || container.querySelector('.photo-tour')) return;

            const photoTour = document.createElement('div');
            photoTour.className = 'photo-tour';

            courseGalleryGroups
                .filter(group => !group.courses || group.courses.includes(currentCourseCode))
                .forEach(group => {
                    const groupSection = document.createElement('section');
                    groupSection.className = 'photo-tour-group';
                    groupSection.setAttribute('aria-labelledby', group.id);

                    const copy = document.createElement('div');
                    copy.className = 'photo-tour-copy';
                    copy.innerHTML = `<h3 id="${group.id}">${group.title}</h3><p>${group.description}</p>`;

                    const grid = document.createElement('div');
                    grid.className = group.images.length === 2 ? 'photo-tour-grid photo-tour-grid-two' : 'photo-tour-grid';

                    group.images.forEach(image => {
                        const [path, alt, caption, featured] = image;
                        const figure = document.createElement('figure');
                        if (featured) figure.className = 'photo-tour-feature';

                        const img = document.createElement('img');
                        img.src = `../assets/Class_Photos/${path}`;
                        img.alt = alt;

                        const figcaption = document.createElement('figcaption');
                        figcaption.textContent = caption;

                        figure.appendChild(img);
                        figure.appendChild(figcaption);
                        grid.appendChild(figure);
                    });

                    groupSection.appendChild(copy);
                    groupSection.appendChild(grid);
                    photoTour.appendChild(groupSection);
                });

            container.appendChild(photoTour);
        });
    }

    renderCourseGalleries();

    // ==========================================
    // Click-to-Enlarge Photo Lightbox
    // ==========================================
    function initImageLightbox() {
        const images = document.querySelectorAll(
            '.home-facility-photos img, .training-lab-grid img, .course-environment-grid img, ' +
            '.course-photo-grid img, .photo-tour-grid img'
        );

        if (!images.length) return;

        let lightbox = document.querySelector('.gallery-lightbox');
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.className = 'gallery-lightbox';
            lightbox.setAttribute('role', 'dialog');
            lightbox.setAttribute('aria-modal', 'true');
            lightbox.setAttribute('aria-label', 'Image preview');
            lightbox.innerHTML = `
                <div class="gallery-lightbox-inner">
                    <button class="gallery-lightbox-close" type="button" aria-label="Close image preview">x</button>
                    <img src="" alt="">
                    <p class="gallery-lightbox-caption"></p>
                </div>
            `;
            document.body.appendChild(lightbox);
        }

        const lightboxImage = lightbox.querySelector('img');
        const lightboxCaption = lightbox.querySelector('.gallery-lightbox-caption');
        const closeButton = lightbox.querySelector('.gallery-lightbox-close');

        function closeLightbox() {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
        }

        function openLightbox(img) {
            const caption = img.closest('figure')?.querySelector('figcaption')?.textContent || img.alt;
            lightboxImage.src = img.currentSrc || img.src;
            lightboxImage.alt = img.alt;
            lightboxCaption.textContent = caption;
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
            closeButton.focus();
        }

        images.forEach(img => {
            if (img.dataset.lightboxReady) return;
            img.dataset.lightboxReady = 'true';
            img.setAttribute('tabindex', '0');
            img.setAttribute('role', 'button');
            img.setAttribute('aria-label', `View larger image: ${img.alt}`);
            img.addEventListener('click', () => openLightbox(img));
            img.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openLightbox(img);
                }
            });
        });

        closeButton.addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', event => {
            if (event.target === lightbox) closeLightbox();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && lightbox.classList.contains('active')) closeLightbox();
        });
    }

    initImageLightbox();

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

    // ==========================================
    // Renewal Form Upload Handler
    // ==========================================
    const renewalUploadForm = document.getElementById('renewalUploadForm');

    if (renewalUploadForm) {
        const dropZone    = document.getElementById('uploadDropZone');
        const fileInput   = document.getElementById('renewalFile');
        const dropContent = document.getElementById('uploadDropContent');
        const preview     = document.getElementById('uploadPreview');
        const previewImg  = document.getElementById('uploadPreviewImg');
        const removeBtn   = document.getElementById('uploadRemoveBtn');
        const submitBtn   = document.getElementById('uploadSubmitBtn');
        const MAX_BYTES   = 3 * 1024 * 1024; // 3 MB

        // Keep a reference to the submit button's SVG icon so we can
        // restore it after resetting the button text without using innerHTML.
        const submitBtnIcon = submitBtn.querySelector('svg');

        let selectedFile = null;

        function showPreview(file) {
            if (previewImg.src) URL.revokeObjectURL(previewImg.src);
            selectedFile = file;
            const url = URL.createObjectURL(file);
            previewImg.src = url;
            dropContent.hidden = true;
            preview.hidden = false;
            // Prevent the hidden file input from intercepting click inside the preview
            fileInput.style.pointerEvents = 'none';
        }

        function clearSelection() {
            if (previewImg.src) URL.revokeObjectURL(previewImg.src);
            previewImg.src = '';
            selectedFile = null;
            fileInput.value = '';
            dropContent.hidden = false;
            preview.hidden = true;
            fileInput.style.pointerEvents = '';
        }

        function validateAndShow(file) {
            if (!file) return;
            if (!['image/jpeg', 'image/png'].includes(file.type)) {
                showUploadMessage('Only JPEG and PNG images are accepted.', 'error');
                return;
            }
            if (file.size > MAX_BYTES) {
                showUploadMessage('Image exceeds the 3 MB limit. Please use a smaller file.', 'error');
                return;
            }
            showPreview(file);
        }

        // Drag-and-drop
        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', function () {
            dropZone.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            var file = e.dataTransfer.files[0];
            if (file) validateAndShow(file);
        });

        // Keyboard accessibility: Enter/Space triggers the file dialog
        dropZone.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });

        fileInput.addEventListener('change', function () {
            if (this.files[0]) validateAndShow(this.files[0]);
        });

        removeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            clearSelection();
        });

        renewalUploadForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            var nameVal  = (renewalUploadForm.querySelector('[name="renewal_name"]')  || {}).value || '';
            var emailVal = (renewalUploadForm.querySelector('[name="renewal_email"]') || {}).value || '';
            var phoneVal = (renewalUploadForm.querySelector('[name="renewal_phone"]') || {}).value || '';

            if (!nameVal.trim())  { showUploadMessage('Please enter your full name.', 'error'); return; }
            if (!emailVal.trim()) { showUploadMessage('Please enter your email address.', 'error'); return; }
            if (!selectedFile)    { showUploadMessage('Please select a form image to upload.', 'error'); return; }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending…';

            try {
                var base64 = await fileToBase64(selectedFile);

                var payload = {
                    full_name:      nameVal,
                    email:          emailVal,
                    phone:          phoneVal,
                    image_base64:   base64,
                    image_filename: selectedFile.name,
                    image_mime:     selectedFile.type,
                };

                var response = await fetch('/api/renewal-upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                var result = await response.json();

                if (response.ok && result.success) {
                    renewalUploadForm.reset();
                    clearSelection();
                    showUploadMessage('Your renewal form has been submitted successfully. We will be in touch shortly.', 'success');
                } else {
                    var msg = result.errors
                        ? result.errors.join(' ')
                        : result.error || 'Something went wrong. Please try again.';
                    showUploadMessage(msg, 'error');
                }
            } catch (err) {
                showUploadMessage('Network error. Please check your connection and try again.', 'error');
            } finally {
                submitBtn.disabled = false;
                // Restore button label and icon using safe DOM methods (no innerHTML)
                submitBtn.textContent = 'Submit Renewal Form';
                if (submitBtnIcon) submitBtn.prepend(submitBtnIcon);
            }
        });

        function fileToBase64(file) {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () {
                    // result is "data:image/jpeg;base64,<data>" — strip the data-URL prefix
                    var base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = function () { reject(new Error('Failed to read file.')); };
                reader.readAsDataURL(file);
            });
        }

        function showUploadMessage(text, type) {
            var prev = renewalUploadForm.querySelector('.upload-status-msg');
            if (prev) prev.remove();

            var msg = document.createElement('div');
            msg.className = 'upload-status-msg';
            msg.textContent = text; // textContent — no XSS risk
            msg.style.padding = '14px 18px';
            msg.style.borderRadius = '8px';
            msg.style.fontSize = '14px';
            msg.style.fontWeight = '600';
            msg.style.marginBottom = '16px';

            if (type === 'success') {
                msg.style.background = '#ecfdf5';
                msg.style.color      = '#065f46';
                msg.style.border     = '1px solid #a7f3d0';
            } else {
                msg.style.background = '#fef2f2';
                msg.style.color      = '#991b1b';
                msg.style.border     = '1px solid #fecaca';
            }

            submitBtn.insertAdjacentElement('beforebegin', msg);
            setTimeout(function () { msg.remove(); }, 10000);
        }
    }

    // ==========================================
    // Course Registration Forms
    // ==========================================
    const courseRegistrationForms = document.querySelectorAll('.course-registration-form');

    courseRegistrationForms.forEach(function (form) {
        const studentList = form.querySelector('[data-student-list]');
        const countInput = form.querySelector('[data-student-count]');
        const addStudentBtn = form.querySelector('[data-add-student]');
        const submitBtn = form.querySelector('.registration-submit-btn');
        const maxStudents = Number(countInput && countInput.max) || 20;

        if (!studentList || !countInput || !addStudentBtn || !submitBtn) return;

        const templateCard = studentList.querySelector('[data-student-card]').cloneNode(true);

        studentList.addEventListener('input', function (event) {
            const ssnInput = event.target.closest('[data-student-field="ssn_last4"]');
            if (!ssnInput) return;
            ssnInput.value = ssnInput.value.replace(/\D/g, '').slice(0, 4);
        });

        addStudentBtn.addEventListener('click', function () {
            const currentCount = getStudentCards().length;
            if (currentCount >= maxStudents) {
                showRegistrationMessage(form, 'A maximum of ' + maxStudents + ' students can be submitted at once.', 'error');
                return;
            }
            addStudentCard(true);
        });

        countInput.addEventListener('input', function () {
            syncStudentCards(Number(countInput.value) || 1);
        });

        studentList.addEventListener('click', function (event) {
            const ssnToggle = event.target.closest('[data-ssn-toggle]');
            if (ssnToggle) {
                const wrapper = ssnToggle.closest('.ssn-input-wrap');
                const ssnInput = wrapper && wrapper.querySelector('[data-student-field="ssn_last4"]');
                if (!ssnInput) return;

                const shouldShow = ssnInput.type === 'password';
                ssnInput.type = shouldShow ? 'text' : 'password';
                ssnToggle.setAttribute('aria-pressed', String(shouldShow));
                ssnToggle.setAttribute('aria-label', (shouldShow ? 'Hide' : 'Show') + ' last four SSN digits');
                const label = ssnToggle.querySelector('span');
                if (label) label.textContent = shouldShow ? 'Hide' : 'Show';
                return;
            }

            const removeBtn = event.target.closest('[data-remove-student]');
            if (!removeBtn) return;
            const cards = getStudentCards();
            if (cards.length <= 1) return;
            removeBtn.closest('[data-student-card]').remove();
            updateStudentCards();
        });

        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            clearRegistrationMessage(form);

            if (!form.reportValidity()) return;

            const students = collectStudents();
            const invalidSsn = students.find(function (student) {
                return !/^\d{4}$/.test(student.ssn_last4);
            });

            if (invalidSsn) {
                showRegistrationMessage(form, 'Each student must include the last four digits of their SSN.', 'error');
                return;
            }

            const payload = {
                course_code: form.dataset.courseCode || '',
                company_name: getNamedValue('company_name'),
                company_contact: getNamedValue('company_contact'),
                company_email: getNamedValue('company_email'),
                company_phone: getNamedValue('company_phone'),
                company_address: getNamedValue('company_address'),
                company_city: getNamedValue('company_city'),
                company_state: getNamedValue('company_state'),
                company_zip: getNamedValue('company_zip'),
                course_session: getCheckedValue('course_session'),
                student_count: students.length,
                website: getNamedValue('website'),
                students: students,
            };

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';

            try {
                const response = await fetch('/api/course-registration', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const result = await response.json();

                if (response.ok && result.success) {
                    form.reset();
                    syncStudentCards(1);
                    showRegistrationMessage(form, 'Registration submitted successfully. Frank will receive the class roster by email.', 'success');
                } else {
                    const message = result.errors
                        ? result.errors.join(' ')
                        : result.error || 'Something went wrong. Please try again.';
                    showRegistrationMessage(form, message, 'error');
                }
            } catch (err) {
                showRegistrationMessage(form, 'Network error. Please check your connection and try again.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Registration';
            }
        });

        updateStudentCards();

        function addStudentCard(shouldFocus) {
            const newCard = templateCard.cloneNode(true);
            newCard.querySelectorAll('input').forEach(function (input) {
                input.value = '';
                if (input.dataset.studentField === 'ssn_last4') input.type = 'password';
            });
            newCard.querySelectorAll('[data-ssn-toggle]').forEach(function (button) {
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-label', 'Show last four SSN digits');
                const label = button.querySelector('span');
                if (label) label.textContent = 'Show';
            });
            studentList.appendChild(newCard);
            updateStudentCards();

            if (shouldFocus) {
                const firstInput = newCard.querySelector('input');
                if (firstInput) firstInput.focus();
            }
        }

        function syncStudentCards(targetCount) {
            const nextCount = Math.max(1, Math.min(maxStudents, targetCount));
            let cards = getStudentCards();

            while (cards.length < nextCount) {
                addStudentCard(false);
                cards = getStudentCards();
            }

            while (cards.length > nextCount) {
                cards[cards.length - 1].remove();
                cards = getStudentCards();
            }

            updateStudentCards();
        }

        function updateStudentCards() {
            const cards = getStudentCards();
            cards.forEach(function (card, index) {
                const heading = card.querySelector('h3');
                if (heading) heading.textContent = 'Student ' + (index + 1);
                card.classList.toggle('can-remove', cards.length > 1);
            });
            countInput.value = String(cards.length);
        }

        function getStudentCards() {
            return Array.from(studentList.querySelectorAll('[data-student-card]'));
        }

        function getNamedValue(name) {
            const field = form.querySelector('[name="' + name + '"]');
            return field ? field.value.trim() : '';
        }

        function getCheckedValue(name) {
            const field = form.querySelector('[name="' + name + '"]:checked');
            return field ? field.value.trim() : '';
        }

        function collectStudents() {
            return getStudentCards().map(function (card) {
                const student = {};
                card.querySelectorAll('[data-student-field]').forEach(function (field) {
                    student[field.dataset.studentField] = field.value.trim();
                });
                return student;
            });
        }
    });

    function clearRegistrationMessage(form) {
        const prev = form.querySelector('.registration-status-msg');
        if (prev) prev.remove();
    }

    function showRegistrationMessage(form, text, type) {
        clearRegistrationMessage(form);
        const msg = document.createElement('div');
        msg.className = 'registration-status-msg ' + type;
        msg.textContent = text;

        const submitRow = form.querySelector('.registration-submit-row');
        if (submitRow) submitRow.insertAdjacentElement('beforebegin', msg);
        else form.appendChild(msg);

        setTimeout(function () { msg.remove(); }, 12000);
    }

    } // End initializeFeatures

    // Load components and initialize
    loadComponents();
});
