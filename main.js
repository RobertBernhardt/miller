// Wait for the DOM to load
document.addEventListener('DOMContentLoaded', function() {
    // Navigation menu toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
        });
    }
    
    // Close menu when clicking a nav item
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            navMenu.classList.remove('active');
        });
    });
    
    // Navbar scroll effect
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.style.padding = '5px 0';
            navbar.style.backgroundColor = 'rgba(26, 58, 90, 0.95)';
        } else {
            navbar.style.padding = '15px 0';
            navbar.style.backgroundColor = 'rgba(26, 58, 90, 0.95)';
        }
    });
    
    // Active menu item on scroll
    const sections = document.querySelectorAll('section');
    window.addEventListener('scroll', function() {
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            
            if (pageYOffset >= (sectionTop - 200)) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
    
    // Testimonial slider
    const dots = document.querySelectorAll('.dot');
    const testimonials = document.querySelectorAll('.testimonial-item');
    
    dots.forEach((dot, index) => {
        dot.addEventListener('click', function() {
            dots.forEach(d => d.classList.remove('active'));
            testimonials.forEach(t => t.classList.remove('active'));
            
            this.classList.add('active');
            testimonials[index].classList.add('active');
        });
    });
    
    // Auto-rotate testimonials every 5 seconds
    let currentTestimonial = 0;
    const testimonialCount = testimonials.length;
    
    function rotateTestimonials() {
        dots.forEach(d => d.classList.remove('active'));
        testimonials.forEach(t => t.classList.remove('active'));
        
        currentTestimonial = (currentTestimonial + 1) % testimonialCount;
        
        dots[currentTestimonial].classList.add('active');
        testimonials[currentTestimonial].classList.add('active');
    }
    
    let testimonialInterval = setInterval(rotateTestimonials, 5000);
    
    // Pause auto-rotation when clicking on a dot
    dots.forEach(dot => {
        dot.addEventListener('click', function() {
            clearInterval(testimonialInterval);
            // Restart after 10 seconds of inactivity
            testimonialInterval = setInterval(rotateTestimonials, 10000);
        });
    });
    
    // Contact form validation
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Simple validation
            let isValid = true;
            const requiredFields = contactForm.querySelectorAll('[required]');
            
            requiredFields.forEach(field => {
                if (!field.value.trim()) {
                    isValid = false;
                    field.style.borderColor = 'red';
                } else {
                    field.style.borderColor = '';
                }
            });
            
            if (isValid) {
                // Here you would normally send the form data to a server
                // For this example, just show a success message
                contactForm.innerHTML = `
                    <div class="success-message">
                        <i class="fas fa-check-circle" style="font-size: 48px; color: green; margin-bottom: 20px;"></i>
                        <h3>Nachricht gesendet!</h3>
                        <p>Vielen Dank für Ihre Anfrage. Wir werden uns in Kürze bei Ihnen melden.</p>
                    </div>
                `;
            }
        });
    }
    
    // Modal functionality
    const impressumLink = document.querySelectorAll('.impressum-link');
    const privacyLink = document.querySelectorAll('.privacy-link');
    const impressumModal = document.getElementById('impressumModal');
    const privacyModal = document.getElementById('privacyModal');
    const closeButtons = document.querySelectorAll('.close-modal');
    
    // Open impressum modal
    impressumLink.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            impressumModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        });
    });
    
    // Open privacy modal
    privacyLink.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            privacyModal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        });
    });
    
    // Close modals
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            impressumModal.style.display = 'none';
            privacyModal.style.display = 'none';
            document.body.style.overflow = '';
        });
    });
    
    // Close modals when clicking outside content
    window.addEventListener('click', function(e) {
        if (e.target === impressumModal) {
            impressumModal.style.display = 'none';
            document.body.style.overflow = '';
        }
        if (e.target === privacyModal) {
            privacyModal.style.display = 'none';
            document.body.style.overflow = '';
        }
    });
    
    // Close modals with Escape key
    window.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            impressumModal.style.display = 'none';
            privacyModal.style.display = 'none';
            document.body.style.overflow = '';
        }
    });
});