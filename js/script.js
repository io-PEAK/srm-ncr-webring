// Benefits Modal Dialog
const benefitsDialog = document.getElementById('benefitsDialog');
const btnBenefits = document.getElementById('btnBenefits');
const closeBenefits = document.getElementById('closeBenefits');

if (btnBenefits && benefitsDialog) {
    btnBenefits.addEventListener('click', () => {
        benefitsDialog.showModal();
    });
}

if (closeBenefits && benefitsDialog) {
    closeBenefits.addEventListener('click', () => {
        benefitsDialog.close();
    });
}

// Global members array
let allMembers = [];

// Fetch members and render directory
fetch('data/members.json')
    .then(response => response.json())
    .then(members => {
        // Exclude members hidden due to unreachable sites
        allMembers = members.filter(m => !m.hidden && !m.unreachableSince);
        
        // Update stats bar
        const memberCountEl = document.getElementById('memberCount');
        if (memberCountEl) {
            memberCountEl.textContent = allMembers.length;
        }

        renderMembers(allMembers);
    })
    .catch(error => {
        console.error('Error loading members:', error);
    });

// Render cards
function renderMembers(membersList) {
    const grid = document.getElementById('memberGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (membersList.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No members found.</div>`;
        return;
    }

    membersList.forEach(member => {
        const card = document.createElement('div');
        card.className = 'member-card';
        
        // Safe check for badge URL
        const badgeUrl = member.badge || 'img/default-badge.svg';

        card.innerHTML = `
            <div class="member-badge-wrapper">
                <img class="member-badge" src="${badgeUrl}" alt="${member.name}'s badge" loading="lazy">
            </div>
            <div class="member-info">
                <div class="member-name">${member.name}</div>
                <div class="member-program">${member.program} (${member.gradDate.split('-')[0]})</div>
                <div class="member-location">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 3px; display: inline-block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    ${member.location || 'SRM NCR'}
                </div>
            </div>
            <a href="${member.website}" target="_blank" rel="noopener noreferrer" class="member-link">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 3px; display: inline-block;"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                Visit Site
            </a>
        `;
        grid.appendChild(card);
    });
}

// Live Search Filter
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = allMembers.filter(m => {
            return (m.name && m.name.toLowerCase().includes(query)) ||
                   (m.program && m.program.toLowerCase().includes(query)) ||
                   (m.location && m.location.toLowerCase().includes(query)) ||
                   (m.website && m.website.toLowerCase().includes(query));
        });
        renderMembers(filtered);
    });
}

// Random Member Button
const btnRandom = document.getElementById('btnRandom');
if (btnRandom) {
    btnRandom.addEventListener('click', () => {
        if (allMembers.length > 0) {
            const randomIndex = Math.floor(Math.random() * allMembers.length);
            const targetUrl = allMembers[randomIndex].website;
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        } else {
            alert('No active members to visit!');
        }
    });
}