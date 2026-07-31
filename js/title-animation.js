const title = document.querySelector('h1');
const original = title.innerHTML;
title.innerHTML = '';

const parts = original.split(/(<sup>.*?<\/sup>)/);

parts.forEach(part => {
  if (part.startsWith('<sup>')) {
    const supEl = document.createElement('sup');
    supEl.textContent = part.replace(/<\/?sup>/g, '');
    title.appendChild(supEl);
  } else {
    part.split('').forEach(char => {
      const span = document.createElement('span');
      span.textContent = char;
      title.appendChild(span);
    });
  }
});

gsap.from('h1 span, h1 sup', {
  opacity: 0,
  y: 20,
  duration: 0.5,
  stagger: 0.03,
  ease: 'power3.out',
});