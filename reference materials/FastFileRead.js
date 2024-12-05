// Define the file path
var filePath = "C:/path/to/your/file.txt"; // Replace with the actual file path

// Initialize a variable to hold the file contents
var fileContents = "";

try {
    // Use Java's utility classes to read the file content
    var file = new java.io.File(filePath);
    var fileReader = new java.io.FileReader(file);
    var fileLength = file.length(); // Get the file size
    
    // Use a char array to read the entire file into memory
    var charArray = java.lang.reflect.Array.newInstance(java.lang.Character.TYPE, fileLength);
    fileReader.read(charArray);
    fileReader.close();
    
    // Convert the char array to a JavaScript string
    fileContents = java.lang.String.valueOf(charArray);
    
    // Log the file contents (optional)
    task.logmsg("File contents read successfully:\n" + fileContents);
} catch (e) {
    // Handle any exceptions
    task.logmsg("An error occurred while reading the file: " + e.getMessage());
}

// Now, the variable 'fileContents' contains the full contents of the file as a string