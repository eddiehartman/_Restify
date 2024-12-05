function parseOpenAPISchema(openApiSchema) {
    openApiSchema = openApiSchema.trim();
    // Check if YAML and if so, convert to Json
    if (openApiSchema.startsWith("openapi: \"")) {
        // Use SnakeYAML to convert the YAML to a map that the ObjectMapper can read
        var Yaml = Packages.org.yaml.snakeyaml.Yaml;
        // Create instances of Yaml and ObjectMapper
        var yaml = new Yaml();
        // Parse YAML into a Java Map
        var map = yaml.load(openApiYaml);

        // Convert Java Map to JSON string
        var jsonString = objectMapper.writeValueAsString(map)
    } else {
        jsonString = openApiSchema;
    }

    var ObjectMapper = Packages.com.fasterxml.jackson.databind.ObjectMapper;

    var objectMapper = new ObjectMapper();

    // Parse the JSON string into a structured object
    var rootNode = objectMapper.readTree(jsonString);

    // Build a structured object to hold the schema
    var schema = {
        title: null,
        description: null,
        endpoints: [],
        components: {}
    };

    // Extract OpenAPI metadata
    if (rootNode.has("info")) {
        var infoNode = rootNode.get("info");
        schema.title = infoNode.has("title") ? infoNode.get("title").asText() : null;
        schema.description = infoNode.has("description") ? infoNode.get("description").asText() : null;
    }

    // Extract paths (endpoints)
    if (rootNode.has("paths")) {
        var pathsNode = rootNode.get("paths");
        var pathIterator = pathsNode.fieldNames();

        while (pathIterator.hasNext()) {
            var path = pathIterator.next();
            var methodsNode = pathsNode.get(path);

            var methods = [];
            var methodIterator = methodsNode.fieldNames();

            while (methodIterator.hasNext()) {
                var method = methodIterator.next();
                var methodDetails = methodsNode.get(method);
                methods.push({
                    method: method.toUpperCase(),
                    summary: methodDetails.has("summary") ? methodDetails.get("summary").asText() : null,
                    operationId: methodDetails.has("operationId") ? methodDetails.get("operationId").asText() : null
                });
            }

            schema.endpoints.push({
                path: path,
                methods: methods
            });
        }
    }

    // Extract components (schemas)
    if (rootNode.has("components") && rootNode.get("components").has("schemas")) {
        var componentsNode = rootNode.get("components").get("schemas");
        var componentIterator = componentsNode.fieldNames();

        while (componentIterator.hasNext()) {
            var componentName = componentIterator.next();
            var componentDetails = componentsNode.get(componentName);
            schema.components[componentName] = objectMapper.writeValueAsString(componentDetails);
        }
    }

    return schema;
}