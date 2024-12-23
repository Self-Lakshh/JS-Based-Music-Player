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

        var mainArea = document.getElementById("chat-container");

        
        queryCount++;

      
        var userDiv = document.createElement("div");
        userDiv.id = `query-${queryCount}`;
        userDiv.classList.add("message-bubble", "user-message"); 
        userDiv.textContent = userQuery;

        mainArea.appendChild(userDiv);

       
        queryInput.value = "";

       
        mainArea.scrollTop = mainArea.scrollHeight;

        setTimeout(function () {
            getBotReply("This is a  response to: " + userQuery);
        }, 1000);
    }

   
    function getBotReply(replyText) {
        var mainArea = document.getElementById("chat-container");

        
        queryCount++;

      
        var botDiv = document.createElement("div");
        botDiv.id = `reply-${queryCount}`;
        botDiv.classList.add("message-bubble", "bot-message"); 
        botDiv.textContent = replyText;

        
        mainArea.appendChild(botDiv);

        
        mainArea.scrollTop = mainArea.scrollHeight;
    }
});
