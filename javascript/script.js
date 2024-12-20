var queryCount = 0;

document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("user-input-form");
    var queryInput = document.getElementById("query");
    var introSection = document.querySelector(".chat-intro");

    
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        sendMessage(); 
    });

    
    queryInput.addEventListener("keypress", function (event) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault(); 
            sendMessage(); 
        }
    });

    function sendMessage() {
        var userQuery = queryInput.value.trim();
        if (userQuery === "") return; 

        
        if (introSection) {
            introSection.style.display = "none";
        }
