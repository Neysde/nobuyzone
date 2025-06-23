document.addEventListener('DOMContentLoaded', () => {
  // Animation for the main title
  anime({
      targets: '.safety .container h1',
      translateY: [-20, 0],
      opacity: [0, 1],
      duration: 1200,
      easing: 'easeOutExpo'
  });

  // Animation for the content boxes
  anime({
      targets: '.safety .container .content-box',
      translateY: [30, 0],
      opacity: [0, 1],
      duration: 1000,
      delay: anime.stagger(150, {start: 300}),
      easing: 'easeOutExpo'
  });
});
