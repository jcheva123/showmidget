document.addEventListener('DOMContentLoaded', () => {
    // Simulate race updates (replace with actual data fetching logic)
    const updateRace = () => {
        const rows = document.querySelectorAll('#results tbody tr');
        if (rows.length > 0) {
            const randomRow = rows[Math.floor(Math.random() * rows.length)];
            randomRow.classList.add('updated-race');
            setTimeout(() => {
                randomRow.classList.remove('updated-race');
            }, 2000); // Matches the animation duration
        }
    };

    // Simulate periodic updates every 10 seconds
    setInterval(updateRace, 10000);
});