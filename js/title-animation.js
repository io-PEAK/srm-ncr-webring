const title = document.querySelector('h1');
const text = title.textContent;
title.textContent = '';

text.split('').forEach(char => {
  const span = document.createElement('span');
  span.textContent = char;
  title.appendChild(span);
});

gsap.from('h1 span', {
  opacity: 0,
  y: 20,
  duration: 0.5,
  stagger: 0.03,
  ease: 'power3.out',
});