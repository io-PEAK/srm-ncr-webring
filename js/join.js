const gradDateInput = document.getElementById('gradDate');
const today = new Date();
const maxDate = new Date();
maxDate.setFullYear(today.getFullYear() + 10);

flatpickr('#gradDate', {
  dateFormat: 'Y-m-d',
  minDate: today,
  maxDate: maxDate,
});

// Only runs when the form is submitted
document.getElementById('joinForm').addEventListener('submit', (event) => {
  event.preventDefault();

  const gradDateValue = gradDateInput.value;
  const gradDate = new Date(gradDateValue);

if (gradDate <= today) {
  alert('Graduation date must be in the future.');
  return;
}

if (gradDate > maxDate) {
  alert('Graduation date seems too far in the future. Please check the year.');
  return;
}

  const entry = {
  name: document.getElementById('name').value,
  website: document.getElementById('website').value,
  program: document.getElementById('program').value,
  gradDate: gradDateValue,
  collegeEmail: document.getElementById('collegeEmail').value,
  personalEmail: document.getElementById('personalEmail').value,
  badge: document.getElementById('badge').value,
  location: document.getElementById('location').value,
};

fetch('https://backend.srmncrwebring.workers.dev', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(entry),
})
  .then(response => response.json())
  .then(result => {
    document.getElementById('output').textContent = 'Submitted! ' + JSON.stringify(result, null, 2);
  })
  .catch(error => {
    document.getElementById('output').textContent = 'Error: ' + error.message;
  });
  
});