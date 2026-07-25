function handleRingNavigation(){
    const rawHash = window.location.hash.slice(1);

    if(!rawHash) return;  // no hash means someone just visited the site directly
    const [siteUrl, queryString] =  rawHash.split('?');
    const params = new URLSearchParams(queryString);
    const direction = params.get('nav');

    fetch('../data/members.json')
        .then(response => response.json())
        .then(members =>{
            const currentIndex = members.findIndex( m => m.website === siteUrl);

            if(currentIndex == -1){
                console.error('site not found in ring:', siteUrl);
                return;
            }

            let targetIndex;
            if(direction === 'next') {
                targetIndex = (currentIndex + 1) % members.length;
            } else if (direction === 'prev') {
                targetIndex = (currentIndex - 1 + members.length) % members.length;
            } else {
                return;
            }
            ;
            window.location.href = members[targetIndex].website;
        });
}

handleRingNavigation();